import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { UsersRepository } from './users.repository';

const CREATABLE_ROLES = ['gestor', 'operador'] as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  findTeam(clientId: string) {
    return this.repo.findManyByClient(clientId);
  }

  /**
   * O Admin cria Gestor/Operador no próprio cliente — nunca outro Admin (isso só nasce pelo superadmin,
   * `src/superadmin/`, evitando que um Admin se multiplique sem controle da Locale). `clientId` vem de
   * `@ClientId()` no controller (JWT), nunca do corpo da requisição — mesma defesa de sempre contra
   * manipulação de `client_id`. Mutação + auditoria na mesma transação (achado #4 da auditoria de
   * 23/10/2026).
   */
  async createTeamMember(
    clientId: string,
    actingAdminId: string,
    data: { email: string; password: string; role: 'gestor' | 'operador' },
  ) {
    if (!CREATABLE_ROLES.includes(data.role)) {
      throw new BadRequestException('Papel inválido — só "gestor" ou "operador" podem ser criados por aqui');
    }
    const passwordHash = await bcrypt.hash(data.password, 10);
    return withTransaction(this.pool, async (client) => {
      const user = await this.repo.create({ clientId, email: data.email, passwordHash, role: data.role }, client);
      await this.audit.record(
        {
          actorType: 'user',
          actorId: actingAdminId,
          clientId,
          action: 'user.create',
          target: user.id,
          after: { email: user.email, role: user.role },
        },
        client,
      );
      return user;
    });
  }

  /**
   * Mesma política da criação: o Admin só desativa/reativa Gestor e Operador do próprio cliente — nunca a
   * si mesmo (ficaria sem admin) nem outro Admin (isso é da Locale). Mutação + auditoria na mesma transação.
   */
  async setAtivo(clientId: string, actingAdminId: string, userId: string, ativo: boolean) {
    if (userId === actingAdminId) throw new BadRequestException('Você não pode alterar o próprio acesso');
    return withTransaction(this.pool, async (client) => {
      const alvo = await this.repo.findOneByClient(clientId, userId, client);
      if (!alvo) throw new NotFoundException('Usuário não encontrado');
      if (alvo.role === 'admin') throw new ForbiddenException('Admin só é desativado pela Locale');
      if ((alvo.desativado_em === null) === ativo) return alvo;
      const atualizado = (await this.repo.setDesativadoEm(clientId, userId, ativo ? null : new Date(), client))!;
      await this.audit.record(
        {
          actorType: 'user',
          actorId: actingAdminId,
          clientId,
          action: ativo ? 'user.reativar' : 'user.desativar',
          target: userId,
          before: { ativo: !ativo },
          after: { ativo },
        },
        client,
      );
      return atualizado;
    });
  }
}
