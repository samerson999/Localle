import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { codigoConfere, gerarCodigo, hashCodigo, MAX_TENTATIVAS } from '../auth/codigo';
import { PG_POOL } from '../db/pg-pool.provider';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import { withTransaction } from '../db/with-transaction';
import { MailService } from '../mail/mail.service';
import { UsersRepository } from './users.repository';

export const VALIDADE_CONFIRMACAO_MIN = 30;
/** Códigos por conta por hora — o e-mail é digitado pela pessoa, então isto segura o uso da conta para mandar e-mail a terceiros. */
export const MAX_ENVIOS_HORA = 3;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALIDO = 'Código inválido ou expirado';

/**
 * Primeiro acesso de quem nasceu por nome de usuário (25/11/2026): a pessoa informa o próprio e-mail e confirma com o
 * código de 6 dígitos enviado a ele — só então o e-mail entra na conta e passa a servir para "esqueci minha senha".
 * Mesmo desenho do convite e da redefinição (src/auth/codigo.ts): no banco só o HMAC, erro conta tentativa, no limite
 * o código é revogado. Só para quem ainda não tem e-mail: trocar um e-mail já confirmado não é deste fluxo.
 */
@Injectable()
export class EmailContaService {
  private readonly logger = new Logger(EmailContaService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly mail: MailService,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /** Devolve o código só para o teste; o controller descarta. `enviado: false` = SMTP fora; a tela deixa seguir sem e-mail. */
  async pedir(clientId: string, userId: string, emailBruto: unknown): Promise<{ enviado: boolean; codigo: string }> {
    const email = typeof emailBruto === 'string' ? emailBruto.trim().toLowerCase() : '';
    if (!EMAIL.test(email) || email.length > 254) throw new BadRequestException('E-mail inválido');
    const user = await this.users.findOneByClient(clientId, userId);
    if (!user) throw new BadRequestException('Usuário não encontrado');
    if (user.email) throw new BadRequestException('Sua conta já tem e-mail');
    if (await this.users.findByEmail(email)) throw new ConflictException('Este e-mail já está em uso por outra conta');
    const { rows } = await this.pool.query<{ n: number }>(
      "select count(*)::int as n from email_confirmacoes where user_id = $1 and criado_em > now() - interval '1 hour'",
      [userId],
    );
    if (rows[0].n >= MAX_ENVIOS_HORA) {
      this.logger.warn(`confirmação de e-mail: limite de ${MAX_ENVIOS_HORA}/h atingido user_id=${userId}`);
      throw new BadRequestException('Muitos códigos pedidos. Tente de novo em uma hora.');
    }

    const codigo = gerarCodigo();
    await withTransaction(this.pool, async (tx) => {
      await tx.query('update email_confirmacoes set revogado_em = now() where user_id = $1 and usado_em is null and revogado_em is null', [userId]);
      await tx.query(
        `insert into email_confirmacoes (user_id, client_id, email, token_hash, expira_em)
         values ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
        [userId, clientId, email, hashCodigo(userId, codigo), VALIDADE_CONFIRMACAO_MIN],
      );
    });
    const enviado = await this.mail.send({
      to: email,
      subject: 'Confirme seu e-mail — Localle',
      text: `Olá,\n\nPara confirmar este e-mail na sua conta da Localle, digite o código:\n\n${codigo}\n\nEle vale por ${VALIDADE_CONFIRMACAO_MIN} minutos. Com o e-mail confirmado, você pode recuperar a senha se esquecê-la. Se você não pediu isso, ignore este e-mail.`,
      html: `<p>Olá,</p><p>Para confirmar este e-mail na sua conta da Localle, digite o código:</p><p style="font-size:28px;font-weight:600;letter-spacing:6px;font-family:monospace">${codigo}</p><p style="color:#666">Ele vale por ${VALIDADE_CONFIRMACAO_MIN} minutos. Com o e-mail confirmado, você pode recuperar a senha se esquecê-la. Se você não pediu isso, ignore este e-mail.</p>`,
    });
    this.logger.log(`confirmação de e-mail emitida user_id=${userId} client_id=${clientId} email_enviado=${enviado}`);
    return { enviado, codigo };
  }

  async confirmar(clientId: string, userId: string, codigoBruto: unknown): Promise<{ email: string }> {
    const codigo = typeof codigoBruto === 'string' ? codigoBruto.trim() : '';
    if (!/^\d{6}$/.test(codigo)) throw new BadRequestException('"codigo" precisa ter 6 dígitos');
    let email: string | null;
    try {
      email = await withTransaction(this.pool, async (tx) => {
        const { rows } = await tx.query<{ id: string; email: string; token_hash: string }>(
          `select id, email, token_hash from email_confirmacoes
            where user_id = $1 and client_id = $2 and usado_em is null and revogado_em is null and expira_em > now()
            order by criado_em desc limit 1 for update`,
          [userId, clientId],
        );
        const c = rows[0];
        if (!c) return null;
        if (!codigoConfere(c.token_hash, userId, codigo)) {
          const { rows: n } = await tx.query<{ tentativas: number }>(
            `update email_confirmacoes set tentativas = tentativas + 1,
                    revogado_em = case when tentativas + 1 >= $2 then now() else revogado_em end
              where id = $1 returning tentativas`,
            [c.id, MAX_TENTATIVAS],
          );
          this.logger.warn(`código de confirmação de e-mail incorreto user_id=${userId} tentativa=${n[0].tentativas}/${MAX_TENTATIVAS}`);
          return null;
        }
        await tx.query('update email_confirmacoes set usado_em = now() where id = $1', [c.id]);
        await this.users.definirEmail(clientId, userId, c.email, tx);
        await this.audit.record({ actorType: 'user', actorId: userId, clientId, action: 'user.email_confirmado', target: userId, after: { email: c.email } }, tx);
        return c.email;
      });
    } catch (err) {
      if (violouUnique(err, UNIQUE.usuarioEmail)) throw new ConflictException('Este e-mail já está em uso por outra conta');
      throw err;
    }
    if (!email) throw new BadRequestException(INVALIDO);
    this.logger.log(`e-mail confirmado no primeiro acesso user_id=${userId} client_id=${clientId}`);
    return { email };
  }
}
