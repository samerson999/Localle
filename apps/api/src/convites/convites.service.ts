import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ActiveUserRepository } from '../auth/active-user.repository';
import { codigoConfere, gerarCodigo, hashCodigo, MAX_TENTATIVAS } from '../auth/codigo';
import { signAuthToken, type Role } from '../auth/jwt';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import { withTransaction } from '../db/with-transaction';
import { MailService } from '../mail/mail.service';

export const VALIDADE_CONVITE_H = 48;
const INVALIDO = 'Código inválido ou expirado';

/** Tela onde o convidado digita o código (HashRouter). `APP_URL` = origem pública do front, ex.: https://app.localle.com.br */
export function linkPrimeiroAcesso(email: string): string {
  const base = (process.env.APP_URL || 'http://localhost:5174').replace(/\/+$/, '');
  return `${base}/#/primeiro-acesso?email=${encodeURIComponent(email)}`;
}

/**
 * Primeiro acesso por código: 6 dígitos de uso único, com validade, que confirmam o e-mail e definem a senha
 * num passo só. O código só existe no e-mail; o banco guarda o HMAC (src/auth/codigo.ts). Cada erro conta
 * tentativa e, no limite, o convite é revogado — é isso que segura a força bruta num código curto (o rate
 * limit por IP dos endpoints públicos segue como débito, `.claude/rules/security.md` item 6).
 */
const PAPEL_CONVITE: Record<string, string> = { admin: 'administrador', gestor: 'gestor', operador: 'operador' };

interface ConviteAberto { id: string; user_id: string; client_id: string; token_hash: string; tentativas: number; email: string; role: Role; client_name: string }

@Injectable()
export class ConvitesService {
  private readonly logger = new Logger(ConvitesService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly mail: MailService,
    private readonly activeUsers: ActiveUserRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  /** Dentro da transação de quem cria o usuário. Revoga convites anteriores ainda abertos do mesmo usuário. Devolve o código. */
  async emitir(executor: Queryable, data: { userId: string; clientId: string; criadoPor: string }): Promise<string> {
    const codigo = gerarCodigo();
    await executor.query(
      'update convites set revogado_em = now() where user_id = $1 and usado_em is null and revogado_em is null',
      [data.userId],
    );
    await executor.query(
      `insert into convites (user_id, client_id, token_hash, expira_em, criado_por)
       values ($1, $2, $3, now() + make_interval(hours => $4), $5)`,
      [data.userId, data.clientId, hashCodigo(data.userId, codigo), VALIDADE_CONVITE_H, data.criadoPor],
    );
    return codigo;
  }

  /** Depois do commit: falha de envio não desfaz o usuário — o convite pode ser reenviado pelo painel. */
  async enviar(email: string, clientName: string, codigo: string, papel: Role = 'admin'): Promise<boolean> {
    const link = linkPrimeiroAcesso(email);
    const comoPapel = PAPEL_CONVITE[papel] ?? PAPEL_CONVITE.admin;
    return this.mail.send({
      to: email,
      subject: 'Seu código de acesso à Localle',
      text: `Olá,\n\nVocê foi cadastrado como ${comoPapel} de ${clientName} na Localle.\nSeu código de primeiro acesso é:\n\n${codigo}\n\nPara confirmar seu e-mail e criar sua senha, acesse ${link} e digite o código.\n\nO código vale por ${VALIDADE_CONVITE_H} horas e só pode ser usado uma vez. Se você não esperava este e-mail, ignore-o.`,
      html: `<p>Olá,</p><p>Você foi cadastrado como ${comoPapel} de <strong>${escapeHtml(clientName)}</strong> na Localle.</p><p>Seu código de primeiro acesso:</p><p style="font-size:28px;font-weight:600;letter-spacing:6px;font-family:monospace">${codigo}</p><p><a href="${link}">Criar minha senha</a> e digite o código.</p><p style="color:#666">O código vale por ${VALIDADE_CONVITE_H} horas e só pode ser usado uma vez. Se você não esperava este e-mail, ignore-o.</p>`,
    });
  }

  /**
   * Envia o código e, se o e-mail não sair (SMTP desligado ou falha), devolve o código para quem convidou
   * repassar por outro meio. Quem convida é admin do cliente ou superadmin — já autenticado e autorizado
   * a dar esse acesso; com SMTP ligado o código nunca volta na resposta.
   */
  async entregar(email: string, clientName: string, codigo: string, papel: Role = 'admin'): Promise<{ conviteEnviado: boolean; codigo: string | null }> {
    const conviteEnviado = await this.enviar(email, clientName, codigo, papel);
    if (!conviteEnviado) this.logger.warn(`convite para ${email} não enviado por e-mail; código devolvido a quem convidou`);
    return { conviteEnviado, codigo: conviteEnviado ? null : codigo };
  }

  private async abertoPorEmail(executor: Queryable, email: string, lock = false): Promise<ConviteAberto | null> {
    const { rows } = await executor.query<ConviteAberto>(
      `select cv.id, cv.user_id, cv.client_id, cv.token_hash, cv.tentativas, u.email, u.role, cl.name as client_name
         from convites cv
         join users u on u.id = cv.user_id
         join clients cl on cl.id = cv.client_id
        where u.email = $1 and cv.usado_em is null and cv.revogado_em is null and cv.expira_em > now()
          and u.desativado_em is null
        order by cv.criado_em desc limit 1
        ${lock ? 'for update of cv' : ''}`,
      [email],
    );
    return rows[0] ?? null;
  }

  /**
   * Confere o código dentro da transação. Erro conta tentativa (e revoga no limite) e devolve `null` — quem
   * chama deixa a transação comitar e só então responde 400, senão a tentativa voltaria no rollback.
   */
  private async conferir(tx: Queryable, email: string, codigo: string): Promise<ConviteAberto | null> {
    const c = await this.abertoPorEmail(tx, email, true);
    if (!c) return null;
    if (codigoConfere(c.token_hash, c.user_id, codigo)) return c;
    const { rows } = await tx.query<{ tentativas: number }>(
      `update convites set tentativas = tentativas + 1,
              revogado_em = case when tentativas + 1 >= $2 then now() end
        where id = $1 returning tentativas`,
      [c.id, MAX_TENTATIVAS],
    );
    this.logger.warn(`código de convite incorreto user_id=${c.user_id} tentativa=${rows[0].tentativas}/${MAX_TENTATIVAS}`);
    return null;
  }

  /** Passo 1 da tela: o código confere? Mostra de qual cliente é o acesso antes de pedir a senha. */
  async verificar(email: string, codigo: string): Promise<{ email: string; clientName: string }> {
    const c = await withTransaction(this.pool, (tx) => this.conferir(tx, email, codigo));
    if (!c) throw new BadRequestException(INVALIDO);
    return { email: c.email, clientName: c.client_name };
  }

  async aceitar(email: string, codigo: string, password: string): Promise<{ accessToken: string }> {
    const passwordHash = await bcrypt.hash(password, 10);
    const aceito = await withTransaction(this.pool, async (tx) => {
      const c = await this.conferir(tx, email, codigo);
      if (!c) return null;
      if (await this.activeUsers.isClientBlocked(c.client_id)) throw new ForbiddenException('Acesso do cliente suspenso. Fale com a Locale.');
      await tx.query('update convites set usado_em = now() where id = $1', [c.id]);
      await tx.query(
        'update users set password_hash = $2, email_confirmado_em = coalesce(email_confirmado_em, now()), senha_alterada_em = now(), updated_at = now() where id = $1',
        [c.user_id, passwordHash],
      );
      await this.audit.record(
        { actorType: 'user', actorId: c.user_id, clientId: c.client_id, action: 'user.aceitar_convite', target: c.user_id },
        tx,
      );
      return c;
    });
    if (!aceito) throw new BadRequestException(INVALIDO);
    this.logger.log(`convite aceito user_id=${aceito.user_id} client_id=${aceito.client_id}`);
    return { accessToken: signAuthToken({ sub: aceito.user_id, clientId: aceito.client_id, role: aceito.role }) };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
