import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { SettingValue } from './setting-definitions';

export interface HistoricoRow {
  id: string;
  group_id: string | null;
  key: string;
  old_value: SettingValue | null;
  new_value: SettingValue | null;
  changed_by: string | null;
  changed_by_email: string | null;
  reason: string | null;
  changed_at: Date;
}

/**
 * Chave composta, não `id` — não estende `BaseRepository`. `client_id` continua sendo sempre o primeiro
 * filtro do `where`, mesma regra; a camada Grupo exige o grupo ser do cliente (`group_id` + `client_id`
 * juntos em `group_settings`).
 */
@Injectable()
export class SettingsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAllOverrides(clientId: string, executor: Queryable = this.pool): Promise<Record<string, SettingValue>> {
    const { rows } = await executor.query<{ key: string; value: SettingValue }>('select key, value from client_settings where client_id = $1', [clientId]);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async findGroupOverrides(clientId: string, groupId: string, executor: Queryable = this.pool): Promise<Record<string, SettingValue>> {
    const { rows } = await executor.query<{ key: string; value: SettingValue }>(
      'select key, value from group_settings where client_id = $1 and group_id = $2',
      [clientId, groupId],
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async findOverride(clientId: string, key: string, groupId: string | null = null): Promise<SettingValue | null> {
    if (groupId) {
      const g = await this.pool.query<{ value: SettingValue }>('select value from group_settings where client_id = $1 and group_id = $2 and key = $3', [
        clientId,
        groupId,
        key,
      ]);
      if (g.rows[0]) return g.rows[0].value;
    }
    const { rows } = await this.pool.query<{ value: SettingValue }>('select value from client_settings where client_id = $1 and key = $2', [clientId, key]);
    return rows[0]?.value ?? null;
  }

  async grupoExiste(clientId: string, groupId: string, executor: Queryable = this.pool): Promise<boolean> {
    const { rowCount } = await executor.query('select 1 from asset_groups where client_id = $1 and id = $2', [clientId, groupId]);
    return (rowCount ?? 0) > 0;
  }

  async setOverride(executor: Queryable, clientId: string, key: string, value: SettingValue, groupId: string | null): Promise<void> {
    if (groupId) {
      await executor.query(
        `insert into group_settings (client_id, group_id, key, value) values ($1, $2, $3, $4::jsonb)
         on conflict (group_id, key) do update set value = excluded.value, updated_at = now()`,
        [clientId, groupId, key, JSON.stringify(value)],
      );
      return;
    }
    await executor.query(
      `insert into client_settings (client_id, key, value) values ($1, $2, $3::jsonb)
       on conflict (client_id, key) do update set value = excluded.value, updated_at = now()`,
      [clientId, key, JSON.stringify(value)],
    );
  }

  /** "Restaurar padrão": apaga o override e volta a herdar (grupo → cliente → plataforma). */
  async clearOverride(executor: Queryable, clientId: string, key: string, groupId: string | null): Promise<void> {
    if (groupId) {
      await executor.query('delete from group_settings where client_id = $1 and group_id = $2 and key = $3', [clientId, groupId, key]);
      return;
    }
    await executor.query('delete from client_settings where client_id = $1 and key = $2', [clientId, key]);
  }

  async registrarHistorico(
    executor: Queryable,
    h: { clientId: string; groupId: string | null; key: string; oldValue: SettingValue | null; newValue: SettingValue | null; changedBy: string | null; reason: string | null },
  ): Promise<void> {
    await executor.query(
      `insert into client_settings_history (client_id, group_id, key, old_value, new_value, changed_by, reason)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
      [h.clientId, h.groupId, h.key, h.oldValue === null ? null : JSON.stringify(h.oldValue), h.newValue === null ? null : JSON.stringify(h.newValue), h.changedBy, h.reason],
    );
  }

  async historico(clientId: string, key: string, groupId: string | null, limite = 50): Promise<HistoricoRow[]> {
    const { rows } = await this.pool.query<HistoricoRow>(
      `select h.id::text, h.group_id, h.key, h.old_value, h.new_value, h.changed_by, u.email as changed_by_email, h.reason, h.changed_at
       from client_settings_history h left join users u on u.id = h.changed_by
       where h.client_id = $1 and h.key = $2 and h.group_id is not distinct from $3
       order by h.changed_at desc, h.id desc limit $4`,
      [clientId, key, groupId, limite],
    );
    return rows;
  }

  /**
   * Valor vigente numa data: a última mudança registrada até `at` (null = sem override naquele momento).
   * Devolve `undefined` quando não há histórico algum antes de `at` (o override atual, se houver, nasceu depois).
   */
  async valorEm(clientId: string, key: string, groupId: string | null, at: Date): Promise<SettingValue | null | undefined> {
    const { rows } = await this.pool.query<{ new_value: SettingValue | null }>(
      `select new_value from client_settings_history
       where client_id = $1 and key = $2 and group_id is not distinct from $3 and changed_at <= $4
       order by changed_at desc, id desc limit 1`,
      [clientId, key, groupId, at],
    );
    return rows[0] ? rows[0].new_value : undefined;
  }
}
