import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Queryable } from '../db/queryable';
import { PG_POOL } from '../db/pg-pool.provider';

export interface AuditEntry {
  actorType: 'user' | 'superadmin';
  actorId: string;
  clientId: string | null;
  action: string;
  target?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Tabela única de auditoria (`audit_log`) para as duas origens que precisam dela hoje: mudança de
 * permissão e ação de superadmin sobre um cliente. Escrita (nunca lida por regra de negócio) — não
 * estende `BaseRepository`.
 */
@Injectable()
export class AuditLogRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * `executor` opcional: passe o `PoolClient` de uma transação aberta por outro repository (ex.
   * `PermissionsRepository.setOverride`) para a auditoria entrar na mesma transação da mutação que ela
   * descreve — nunca duas chamadas separadas para uma ação que precisa ser atômica (achado #4 da
   * auditoria de 23/10/2026). Sem `executor`, usa o pool direto (ação que não precisa de atomicidade com
   * outra escrita).
   */
  async record(entry: AuditEntry, executor: Queryable = this.pool): Promise<void> {
    await executor.query(
      `insert into audit_log (actor_type, actor_id, client_id, action, target, before, after)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.actorType,
        entry.actorId,
        entry.clientId,
        entry.action,
        entry.target ?? null,
        entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === undefined ? null : JSON.stringify(entry.after),
      ],
    );
  }
}
