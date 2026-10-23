import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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
}
