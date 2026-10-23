import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ClientsRepository } from '../clients/clients.repository';
import type { ClientEntity } from '../clients/client.entity';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { UsersRepository } from '../users/users.repository';
import type { UserEntity } from '../users/user.entity';

/**
 * Ações de superadmin sobre um cliente — sempre com `client_id` explícito (nunca implícito de um token,
 * porque o token de superadmin não tem um) e sempre auditadas (requisito: "qualquer operação sobre um
 * cliente deve utilizar um contexto explícito e auditável"). Mutação + auditoria na mesma transação
 * (achado #4 da auditoria de 23/10/2026).
 */
@Injectable()
export class SuperadminClientsService {
  constructor(
    private readonly clients: ClientsRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async createClient(superadminId: string, data: { name: string; revendaId?: string }): Promise<ClientEntity> {
    return withTransaction(this.pool, async (client) => {
      const created = await this.clients.create({ name: data.name, revendaId: data.revendaId }, client);
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
          clientId: created.id,
          action: 'client.create',
          target: created.id,
          after: { name: created.name },
        },
        client,
      );
      return created;
    });
  }

  async createInitialAdmin(
    superadminId: string,
    clientId: string,
    data: { email: string; password: string },
  ): Promise<UserEntity> {
    const passwordHash = await bcrypt.hash(data.password, 10);
    return withTransaction(this.pool, async (client) => {
      const user = await this.users.create({ clientId, email: data.email, passwordHash, role: 'admin' }, client);
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
          clientId,
          action: 'user.create_initial_admin',
          target: user.id,
          after: { email: user.email, role: user.role },
        },
        client,
      );
      return user;
    });
  }
}
