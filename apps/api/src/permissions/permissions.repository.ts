import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { Role } from '../auth/jwt';

/**
 * Chave composta (`client_id`, `role`, `permission_key`) — mesma convenção de `SettingsRepository`:
 * `client_id` é sempre o primeiro filtro do `where`, sem exceção.
 */
@Injectable()
export class PermissionsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAllOverrides(clientId: string): Promise<Record<Role, Record<string, boolean>>> {
    const { rows } = await this.pool.query<{ role: Role; permission_key: string; allowed: boolean }>(
      'select role, permission_key, allowed from role_permission_overrides where client_id = $1',
      [clientId],
    );
    const result: Record<Role, Record<string, boolean>> = { admin: {}, gestor: {}, operador: {} };
    for (const row of rows) result[row.role][row.permission_key] = row.allowed;
    return result;
  }

  /**
   * Correção de 23/10/2026 (revisão pós-pentest): `select ... for update` não bloqueia nada quando a
   * linha ainda não existe — duas transações concorrentes criando o PRIMEIRO override da mesma chave
   * passavam as duas pelo "antes = padrão", e a auditoria da segunda ficava com um "antes" desatualizado
   * (não refletia a escrita da primeira). Lock consultivo (`pg_advisory_xact_lock`, liberado sozinho no
   * commit/rollback) serializa as duas transações pela chave lógica (`client_id:role:permission_key`),
   * com ou sem linha existente — chamar isso é o primeiro passo de `set`/`restoreDefault`, antes de ler
   * o "antes".
   */
  async lockOverrideKey(client: PoolClient, clientId: string, role: Role, key: string): Promise<void> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`${clientId}:${role}:${key}`]);
  }

  /**
   * `forUpdate`: true dentro de uma transação de escrita (`PermissionsService.set`/`restoreDefault`) —
   * trava a linha (se existir) até o commit, para que o "antes" lido para a auditoria não fique
   * desatualizado por uma escrita concorrente na mesma chave (achado #5 da auditoria de 23/10/2026).
   */
  async findOverride(
    clientId: string,
    role: Role,
    key: string,
    executor: Queryable = this.pool,
    forUpdate = false,
  ): Promise<boolean | null> {
    const { rows } = await executor.query<{ allowed: boolean }>(
      `select allowed from role_permission_overrides where client_id = $1 and role = $2 and permission_key = $3
       ${forUpdate ? 'for update' : ''}`,
      [clientId, role, key],
    );
    return rows[0]?.allowed ?? null;
  }

  /** `executor` opcional: ver nota em `AuditLogRepository.record` — mesma razão (atomicidade com auditoria). */
  async setOverride(
    clientId: string,
    role: Role,
    key: string,
    allowed: boolean,
    updatedBy: string,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `insert into role_permission_overrides (client_id, role, permission_key, allowed, updated_by)
       values ($1, $2, $3, $4, $5)
       on conflict (client_id, role, permission_key)
       do update set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = now()`,
      [clientId, role, key, allowed, updatedBy],
    );
  }

  async clearOverride(clientId: string, role: Role, key: string, executor: Queryable = this.pool): Promise<void> {
    await executor.query(
      'delete from role_permission_overrides where client_id = $1 and role = $2 and permission_key = $3',
      [clientId, role, key],
    );
  }
}
