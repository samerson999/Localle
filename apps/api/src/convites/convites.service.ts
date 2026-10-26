import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ActiveUserRepository } from '../auth/active-user.repository';
import { signAuthToken, type Role } from '../auth/jwt';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import { withTransaction } from '../db/with-transaction';
import { MailService } from '../mail/mail.service';

export const VALIDADE_CONVITE_H = 48;
const INVALIDO = 'Convite inválido ou expirado';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Link do convite no front (HashRouter). `APP_URL` = origem pública do front, ex.: https://app.localle.com.br */
export function linkConvite(token: string): string {
  const base = (process.env.APP_URL || 'http://localhost:5174').replace(/\/+$/, '');
  return `${base}/#/convite/${token}`;
}

/**
 * Primeiro acesso por convite: link de uso único, com validade, que confirma o e-mail e define a senha num
 * passo só. O token (256 bits aleatórios) só existe no e-mail; o banco guarda o SHA-256. Por isso não há
 * rate limit dedicado no aceite — adivinhar um token é inviável; continua valendo o débito geral de rate
 * limit dos endpoints públicos (`.claude/rules/security.md` item 6).
 */
@Injectable()
export class ConvitesService {
  private readonly logger = new Logger(ConvitesService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly mail: MailService,
    private readonly activeUsers: ActiveUserRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  /** Dentro da transação de quem cria o usuário. Revoga convites anteriores ainda abertos do mesmo usuário. */
  async emitir(executor: Queryable, data: { userId: string; clientId: string; criadoPor: string }): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await executor.query(
      'update convites set revogado_em = now() where user_id = $1 and usado_em is null and revogado_em is null',
      [data.userId],
    );
    await executor.query(
      `insert into convites (user_id, client_id, token_hash, expira_em, criado_por)
       values ($1, $2, $3, now() + make_interval(hours => $4), $5)`,
      [data.userId, data.clientId, hashToken(token), VALIDADE_CONVITE_H, data.criadoPor],
    );
    return token;
  }

  /** Depois do commit: falha de envio não desfaz o usuário — o convite pode ser reenviado pelo painel. */
  async enviar(email: string, clientName: string, token: string): Promise<boolean> {
    const link = linkConvite(token);
    return this.mail.send({
      to: email,
      subject: 'Seu acesso à Localle',
      text: `Olá,\n\nVocê foi cadastrado como administrador de ${clientName} na Localle.\nPara confirmar seu e-mail e criar sua senha, acesse:\n\n${link}\n\nO link vale por ${VALIDADE_CONVITE_H} horas e só pode ser usado uma vez. Se você não esperava este e-mail, ignore-o.`,
      html: `<p>Olá,</p><p>Você foi cadastrado como administrador de <strong>${escapeHtml(clientName)}</strong> na Localle.</p><p>Para confirmar seu e-mail e criar sua senha:</p><p><a href="${link}">Criar minha senha</a></p><p style="color:#666">O link vale por ${VALIDADE_CONVITE_H} horas e só pode ser usado uma vez. Se você não esperava este e-mail, ignore-o.</p>`,
    });
  }

  private async abertoPorToken(executor: Queryable, token: string, lock = false) {
    const { rows } = await executor.query<{ id: string; user_id: string; client_id: string; email: string; role: Role; client_name: string }>(
      `select cv.id, cv.user_id, cv.client_id, u.email, u.role, cl.name as client_name
         from convites cv
         join users u on u.id = cv.user_id
         join clients cl on cl.id = cv.client_id
        where cv.token_hash = $1 and cv.usado_em is null and cv.revogado_em is null and cv.expira_em > now()
          and u.desativado_em is null
        ${lock ? 'for update of cv' : ''}`,
      [hashToken(token)],
    );
    return rows[0] ?? null;
  }

  /** Para a tela do convite mostrar a quem ele pertence antes de pedir a senha. */
  async consultar(token: string): Promise<{ email: string; clientName: string }> {
    const c = await this.abertoPorToken(this.pool, token);
    if (!c) throw new NotFoundException(INVALIDO);
    return { email: c.email, clientName: c.client_name };
  }

  async aceitar(token: string, password: string): Promise<{ accessToken: string }> {
    const passwordHash = await bcrypt.hash(password, 10);
    const aceito = await withTransaction(this.pool, async (tx) => {
      const c = await this.abertoPorToken(tx, token, true);
      if (!c) throw new NotFoundException(INVALIDO);
      if (await this.activeUsers.isClientBlocked(c.client_id)) throw new ForbiddenException('Acesso do cliente suspenso. Fale com a Locale.');
      await tx.query('update convites set usado_em = now() where id = $1', [c.id]);
      await tx.query(
        'update users set password_hash = $2, email_confirmado_em = coalesce(email_confirmado_em, now()), updated_at = now() where id = $1',
        [c.user_id, passwordHash],
      );
      await this.audit.record(
        { actorType: 'user', actorId: c.user_id, clientId: c.client_id, action: 'user.aceitar_convite', target: c.user_id },
        tx,
      );
      return c;
    });
    this.logger.log(`convite aceito user_id=${aceito.user_id} client_id=${aceito.client_id}`);
    return { accessToken: signAuthToken({ sub: aceito.user_id, clientId: aceito.client_id, role: aceito.role }) };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
