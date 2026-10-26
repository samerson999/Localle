import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { MailService } from '../mail/mail.service';
import { UsersRepository } from '../users/users.repository';
import { ActiveUserRepository } from './active-user.repository';
import { signAuthToken } from './jwt';
import { SenhaRepository } from './senha.repository';

export const VALIDADE_REDEFINICAO_MIN = 30;
/** Pedidos por conta por hora: acima disso o e-mail não é reenviado (resposta continua 202 — não revela nada). */
export const MAX_PEDIDOS_HORA = 3;
const INVALIDO = 'Link de redefinição inválido ou expirado';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function linkRedefinicao(token: string): string {
  const base = (process.env.APP_URL || 'http://localhost:5174').replace(/\/+$/, '');
  return `${base}/#/redefinir-senha/${token}`;
}

/**
 * Senha: "esqueci" (link de uso único por e-mail, mesmo desenho do convite), redefinir pelo link, trocar
 * logado (exige a senha atual) e renovar o token antes de expirar. O pedido de redefinição responde
 * sempre igual — e-mail inexistente, desativado ou acima do limite não muda a resposta nem o tempo (o
 * custo do bcrypt não entra aqui; o que varia é só o envio do e-mail, que é assíncrono ao chamador).
 */
@Injectable()
export class SenhaService {
  private readonly logger = new Logger(SenhaService.name);

  constructor(
    private readonly repo: SenhaRepository,
    private readonly users: UsersRepository,
    private readonly activeUsers: ActiveUserRepository,
    private readonly mail: MailService,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /** Devolve o token só para o teste; o controller descarta (o usuário recebe por e-mail). */
  async esqueci(email: string): Promise<string | null> {
    const user = await this.users.findByEmail(email);
    if (!user || user.desativado_em) {
      this.logger.log(`Redefinição de senha pedida para e-mail desconhecido ou desativado (não enviada)`);
      return null;
    }
    if ((await this.repo.pedidosNaUltimaHora(user.id)) >= MAX_PEDIDOS_HORA) {
      this.logger.warn(`Redefinição de senha: limite de ${MAX_PEDIDOS_HORA}/h atingido para user_id=${user.id} (não enviada)`);
      return null;
    }
    const token = randomBytes(32).toString('base64url');
    await withTransaction(this.pool, (tx) => this.repo.emitir(tx, { userId: user.id, clientId: user.client_id, tokenHash: hashToken(token), validadeMin: VALIDADE_REDEFINICAO_MIN }));
    const link = linkRedefinicao(token);
    const enviado = await this.mail.send({
      to: user.email,
      subject: 'Redefinição de senha — Localle',
      text: `Olá,\n\nRecebemos um pedido para redefinir a senha da sua conta na Localle. Para criar uma nova senha, acesse:\n\n${link}\n\nO link vale por ${VALIDADE_REDEFINICAO_MIN} minutos e só pode ser usado uma vez. Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.`,
      html: `<p>Olá,</p><p>Recebemos um pedido para redefinir a senha da sua conta na Localle.</p><p><a href="${link}">Criar nova senha</a></p><p style="color:#666">O link vale por ${VALIDADE_REDEFINICAO_MIN} minutos e só pode ser usado uma vez. Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.</p>`,
    });
    this.logger.log(`Redefinição de senha emitida user_id=${user.id} client_id=${user.client_id} email_enviado=${enviado}`);
    return token;
  }

  async consultar(token: string): Promise<{ email: string }> {
    const r = await this.repo.abertaPorHash(this.pool, hashToken(token));
    if (!r) throw new NotFoundException(INVALIDO);
    return { email: r.email };
  }

  async redefinir(token: string, password: string): Promise<{ accessToken: string }> {
    const passwordHash = await bcrypt.hash(password, 10);
    const r = await withTransaction(this.pool, async (tx) => {
      const aberta = await this.repo.abertaPorHash(tx, hashToken(token), true);
      if (!aberta) throw new NotFoundException(INVALIDO);
      if (await this.activeUsers.isClientBlocked(aberta.client_id)) throw new ForbiddenException('Acesso do cliente suspenso. Fale com a Locale.');
      await this.repo.marcarUsada(tx, aberta.id);
      await this.repo.definirSenha(tx, aberta.user_id, passwordHash);
      await this.audit.record({ actorType: 'user', actorId: aberta.user_id, clientId: aberta.client_id, action: 'user.redefinir_senha', target: aberta.user_id }, tx);
      return aberta;
    });
    this.logger.log(`senha redefinida por link user_id=${r.user_id} client_id=${r.client_id}`);
    return { accessToken: signAuthToken({ sub: r.user_id, clientId: r.client_id, role: r.role }) };
  }

  /** Logado: a senha atual é exigida de novo — um token roubado não troca a senha sozinho. */
  async trocar(clientId: string, userId: string, senhaAtual: string, novaSenha: string): Promise<void> {
    const user = await this.users.findOneByClient(clientId, userId);
    if (!user || !user.password_hash || !(await bcrypt.compare(senhaAtual, user.password_hash))) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
    const passwordHash = await bcrypt.hash(novaSenha, 10);
    await withTransaction(this.pool, async (tx) => {
      await this.repo.trocarSenha(tx, clientId, userId, passwordHash);
      await this.audit.record({ actorType: 'user', actorId: userId, clientId, action: 'user.trocar_senha', target: userId }, tx);
    });
    this.logger.log(`senha trocada user_id=${userId} client_id=${clientId}`);
  }
}
