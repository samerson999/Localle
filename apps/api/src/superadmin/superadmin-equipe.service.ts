import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { signAuthToken } from '../auth/jwt';
import { PG_POOL } from '../db/pg-pool.provider';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import { withTransaction } from '../db/with-transaction';
import { MailService } from '../mail/mail.service';
import { SuperadminRepository, type MembroEquipe } from './superadmin.repository';

export const VALIDADE_CONVITE_LOCALLE_H = 72;
const INVALIDO = 'Convite inválido ou expirado';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Link do convite no front (HashRouter), separado do convite de usuário de cliente (`#/convite/`). */
export function linkConviteLocalle(token: string): string {
  const base = (process.env.APP_URL || 'http://localhost:5174').replace(/\/+$/, '');
  return `${base}/#/convite-localle/${token}`;
}

const membro = (s: { id: string; email: string; created_at: Date; desativado_em: Date | null; password_hash: string | null }): MembroEquipe => ({
  id: s.id,
  email: s.email,
  created_at: s.created_at,
  desativado_em: s.desativado_em,
  pendente: s.password_hash === null,
});

/**
 * Equipe da Locale (superadmins) pelo painel: convidar por e-mail (link de uso único, mesmo desenho do
 * convite de cliente — quem convida nunca conhece a senha), reenviar, desativar/reativar e trocar a própria
 * senha. Toda mutação é auditada na mesma transação (`audit_log`, actor superadmin, sem `client_id`).
 */
@Injectable()
export class SuperadminEquipeService {
  private readonly logger = new Logger(SuperadminEquipeService.name);

  constructor(
    private readonly repo: SuperadminRepository,
    private readonly mail: MailService,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async convidar(atorId: string, email: string): Promise<{ superadmin: MembroEquipe; conviteEnviado: boolean; link: string | null }> {
    let criado: { id: string; email: string; created_at: Date; desativado_em: Date | null; password_hash: string | null };
    let token: string;
    try {
      ({ criado, token } = await withTransaction(this.pool, async (tx) => {
        const novo = await this.repo.criarConvidado(email, tx);
        const t = await this.emitir(tx, novo.id, atorId);
        await this.audit.record({ actorType: 'superadmin', actorId: atorId, clientId: null, action: 'superadmin.convidar', target: novo.id, after: { email } }, tx);
        return { criado: novo, token: t };
      }));
    } catch (err) {
      if (violouUnique(err, UNIQUE.superadminEmail)) throw new ConflictException('Já existe um acesso da Locale com este e-mail');
      throw err;
    }
    const entrega = await this.entregar(criado.email, token);
    this.logger.log(`superadmin convidado id=${criado.id} por superadmin=${atorId} email_enviado=${entrega.conviteEnviado}`);
    return { superadmin: membro(criado), ...entrega };
  }

  /** Novo link (o anterior deixa de valer). Só para quem ainda não definiu a senha e está ativo. */
  async reenviar(atorId: string, id: string): Promise<{ conviteEnviado: boolean; link: string | null }> {
    const alvo = await this.repo.findById(id);
    if (!alvo) throw new NotFoundException('Acesso não encontrado');
    if (alvo.password_hash) throw new BadRequestException('Este acesso já definiu a senha — o convite não se aplica mais');
    if (alvo.desativado_em) throw new BadRequestException('Acesso desativado — reative antes de reenviar o convite');
    const token = await withTransaction(this.pool, async (tx) => {
      const t = await this.emitir(tx, id, atorId);
      await this.audit.record({ actorType: 'superadmin', actorId: atorId, clientId: null, action: 'superadmin.reenviar_convite', target: id }, tx);
      return t;
    });
    return this.entregar(alvo.email, token);
  }

  /** Nunca o próprio acesso — quem desativa continua ativo, então a Locale nunca fica sem nenhum superadmin. */
  async setAtivo(atorId: string, id: string, ativo: boolean): Promise<MembroEquipe> {
    if (id === atorId) throw new BadRequestException('Você não pode alterar o próprio acesso');
    return withTransaction(this.pool, async (tx) => {
      const alvo = await this.repo.findById(id, tx);
      if (!alvo) throw new NotFoundException('Acesso não encontrado');
      if ((alvo.desativado_em === null) === ativo) return membro(alvo);
      const atualizado = (await this.repo.setDesativadoEm(id, ativo ? null : new Date(), tx))!;
      await this.audit.record(
        { actorType: 'superadmin', actorId: atorId, clientId: null, action: ativo ? 'superadmin.reativar' : 'superadmin.desativar', target: id, before: { ativo: !ativo }, after: { ativo } },
        tx,
      );
      this.logger.log(`superadmin ${ativo ? 'reativado' : 'desativado'} id=${id} por superadmin=${atorId}`);
      return membro(atualizado);
    });
  }

  /** Logado: exige a senha atual — um token roubado não troca a senha sozinho. */
  async trocarSenha(id: string, senhaAtual: string, novaSenha: string): Promise<void> {
    const eu = await this.repo.findById(id);
    if (!eu || !eu.password_hash || !(await bcrypt.compare(senhaAtual, eu.password_hash))) throw new UnauthorizedException('Senha atual incorreta');
    const hash = await bcrypt.hash(novaSenha, 10);
    await withTransaction(this.pool, async (tx) => {
      await this.repo.definirSenha(id, hash, tx);
      await this.audit.record({ actorType: 'superadmin', actorId: id, clientId: null, action: 'superadmin.trocar_senha', target: id }, tx);
    });
    this.logger.log(`senha trocada superadmin=${id}`);
  }

  async consultarConvite(token: string): Promise<{ email: string }> {
    const c = await this.repo.conviteAberto(this.pool, hashToken(token));
    if (!c) throw new NotFoundException(INVALIDO);
    return { email: c.email };
  }

  async aceitarConvite(token: string, password: string): Promise<{ accessToken: string }> {
    const hash = await bcrypt.hash(password, 10);
    const aceito = await withTransaction(this.pool, async (tx) => {
      const c = await this.repo.conviteAberto(tx, hashToken(token), true);
      if (!c) throw new NotFoundException(INVALIDO);
      await this.repo.marcarConviteUsado(tx, c.id);
      await this.repo.definirSenha(c.superadmin_id, hash, tx);
      await this.audit.record({ actorType: 'superadmin', actorId: c.superadmin_id, clientId: null, action: 'superadmin.aceitar_convite', target: c.superadmin_id }, tx);
      return c;
    });
    this.logger.log(`convite da Locale aceito superadmin=${aceito.superadmin_id}`);
    return { accessToken: signAuthToken({ sub: aceito.superadmin_id, role: 'superadmin' }) };
  }

  private async emitir(executor: Parameters<SuperadminRepository['emitirConvite']>[0], superadminId: string, criadoPor: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.repo.emitirConvite(executor, { superadminId, tokenHash: hashToken(token), validadeH: VALIDADE_CONVITE_LOCALLE_H, criadoPor });
    return token;
  }

  /** Depois do commit. Sem SMTP (ou falha), o link volta para quem convidou repassar por outro meio. */
  private async entregar(email: string, token: string): Promise<{ conviteEnviado: boolean; link: string | null }> {
    const link = linkConviteLocalle(token);
    const conviteEnviado = await this.mail.send({
      to: email,
      subject: 'Seu acesso ao Painel da Localle',
      text: `Olá,\n\nVocê foi convidado para a equipe da Localle (Painel da Localle).\nPara criar sua senha, acesse:\n\n${link}\n\nO link vale por ${VALIDADE_CONVITE_LOCALLE_H} horas e só pode ser usado uma vez. Se você não esperava este e-mail, ignore-o.`,
      html: `<p>Olá,</p><p>Você foi convidado para a equipe da Localle (Painel da Localle).</p><p><a href="${link}">Criar minha senha</a></p><p style="color:#666">O link vale por ${VALIDADE_CONVITE_LOCALLE_H} horas e só pode ser usado uma vez. Se você não esperava este e-mail, ignore-o.</p>`,
    });
    if (!conviteEnviado) this.logger.warn(`convite da Locale para ${email} não enviado por e-mail; link devolvido a quem convidou`);
    return { conviteEnviado, link: conviteEnviado ? null : link };
  }
}
