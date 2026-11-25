import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import { withTransaction } from '../db/with-transaction';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import type { UserEntity } from './user.entity';
import { UsersRepository, type EscopoUsuario } from './users.repository';

const CREATABLE_ROLES = ['gestor', 'operador'] as const;
type Perfil = { role: 'gestor' | 'operador'; perfilId: string | null };

/**
 * Equipe do cliente pelo Admin (Setup › Equipe e acessos). Desde 25/11/2026 sem convite por e-mail: o Admin cria o
 * acesso com nome de usuário + senha e repassa à pessoa, que informa o próprio e-mail no primeiro acesso
 * (`EmailContaService`). Nunca cria outro Admin (isso só nasce pelo superadmin, `src/superadmin/`), nem mexe no
 * próprio acesso (ficaria sem admin) ou no de outro Admin. `clientId` vem sempre de `@ClientId()` (JWT).
 * Toda mutação grava auditoria na mesma transação.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly repo: UsersRepository,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  findTeam(clientId: string) {
    return this.repo.findManyByClient(clientId);
  }

  async criarMembro(clientId: string, actingAdminId: string, data: { username: string; senha: string; escopo: EscopoUsuario } & Perfil) {
    if (!CREATABLE_ROLES.includes(data.role)) {
      throw new BadRequestException('Papel inválido — só "gestor" ou "operador" podem ser criados por aqui');
    }
    const passwordHash = await bcrypt.hash(data.senha, 10);
    let user: UserEntity;
    try {
      user = await withTransaction(this.pool, async (tx) => {
        const u = await this.repo.create({ clientId, username: data.username, passwordHash, role: data.role, perfilId: data.perfilId }, tx);
        await this.repo.definirEscopo(clientId, u.id, data.escopo, tx);
        await this.audit.record(
          {
            actorType: 'user',
            actorId: actingAdminId,
            clientId,
            action: 'user.create',
            target: u.id,
            after: { username: u.username, role: u.role, perfilId: u.perfil_id, escopo: data.escopo },
          },
          tx,
        );
        return u;
      });
    } catch (err) {
      if (violouUnique(err, UNIQUE.usuarioUsername)) throw new ConflictException('Este nome de usuário já está em uso');
      throw err;
    }
    this.logger.log(`membro criado user_id=${user.id} client_id=${clientId} por user_id=${actingAdminId} restrito=${data.escopo.restrito}`);
    return user;
  }

  /** Alvo editável pelo Admin: do cliente, não excluído, não é ele mesmo nem outro Admin. */
  private async alvo(clientId: string, actingAdminId: string, userId: string, tx: Queryable): Promise<UserEntity> {
    if (userId === actingAdminId) throw new BadRequestException('Você não pode alterar o próprio acesso');
    const alvo = await this.repo.findOneByClient(clientId, userId, tx);
    if (!alvo) throw new NotFoundException('Usuário não encontrado');
    if (alvo.role === 'admin') throw new ForbiddenException('O acesso do admin só é alterado pela Locale');
    return alvo;
  }

  async setAtivo(clientId: string, actingAdminId: string, userId: string, ativo: boolean) {
    return withTransaction(this.pool, async (client) => {
      const alvo = await this.alvo(clientId, actingAdminId, userId, client);
      if ((alvo.desativado_em === null) === ativo) return alvo;
      const atualizado = (await this.repo.setDesativadoEm(clientId, userId, ativo ? null : new Date(), client))!;
      await this.audit.record(
        { actorType: 'user', actorId: actingAdminId, clientId, action: ativo ? 'user.reativar' : 'user.desativar', target: userId, before: { ativo: !ativo }, after: { ativo } },
        client,
      );
      return atualizado;
    });
  }

  /** Vale na próxima requisição da pessoa — a autorização lê papel e perfil do banco. */
  async definirPerfil(clientId: string, actingAdminId: string, userId: string, perfil: Perfil) {
    const atualizado = await withTransaction(this.pool, async (client) => {
      const alvo = await this.alvo(clientId, actingAdminId, userId, client);
      const novo = (await this.repo.setPerfil(clientId, userId, perfil.role, perfil.perfilId, client))!;
      await this.audit.record(
        {
          actorType: 'user',
          actorId: actingAdminId,
          clientId,
          action: 'user.perfil',
          target: userId,
          before: { role: alvo.role, perfilId: alvo.perfil_id },
          after: { role: novo.role, perfilId: novo.perfil_id },
        },
        client,
      );
      return novo;
    });
    this.logger.log(`perfil alterado user_id=${userId} client_id=${clientId} perfil=${perfil.perfilId ?? perfil.role} por user_id=${actingAdminId}`);
    return atualizado;
  }

  /** Quais veículos a pessoa vê. Vale na próxima requisição (o `AuthGuard` resolve o escopo do banco a cada uma). */
  async definirEscopo(clientId: string, actingAdminId: string, userId: string, escopo: EscopoUsuario) {
    await withTransaction(this.pool, async (tx) => {
      await this.alvo(clientId, actingAdminId, userId, tx);
      const antes = await this.repo.escopo(clientId, userId, tx);
      await this.repo.definirEscopo(clientId, userId, escopo, tx);
      await this.audit.record({ actorType: 'user', actorId: actingAdminId, clientId, action: 'user.escopo', target: userId, before: antes, after: escopo }, tx);
    });
    this.logger.log(`escopo de veículos alterado user_id=${userId} client_id=${clientId} restrito=${escopo.restrito} por user_id=${actingAdminId}`);
    return (await this.repo.escopo(clientId, userId))!;
  }

  /** O Admin define uma senha nova (a pessoa esqueceu e ainda não tem e-mail). As sessões abertas dela caem. */
  async definirSenha(clientId: string, actingAdminId: string, userId: string, senha: string) {
    const passwordHash = await bcrypt.hash(senha, 10);
    await withTransaction(this.pool, async (tx) => {
      await this.alvo(clientId, actingAdminId, userId, tx);
      await this.repo.definirSenha(clientId, userId, passwordHash, tx);
      await this.audit.record({ actorType: 'user', actorId: actingAdminId, clientId, action: 'user.redefinir_senha', target: userId }, tx);
    });
    this.logger.log(`senha definida pelo admin user_id=${userId} client_id=${clientId} por user_id=${actingAdminId}`);
  }

  /** Some da equipe e perde o acesso na hora; o histórico (comandos, alertas tratados, auditoria) continua com a pessoa. */
  async excluir(clientId: string, actingAdminId: string, userId: string) {
    await withTransaction(this.pool, async (tx) => {
      const alvo = await this.alvo(clientId, actingAdminId, userId, tx);
      await this.repo.excluir(clientId, userId, tx);
      await this.audit.record(
        { actorType: 'user', actorId: actingAdminId, clientId, action: 'user.excluir', target: userId, before: { username: alvo.username, email: alvo.email, role: alvo.role } },
        tx,
      );
    });
    this.logger.log(`membro excluído user_id=${userId} client_id=${clientId} por user_id=${actingAdminId}`);
  }
}
