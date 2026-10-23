import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

/**
 * Chave composta (`client_id`, `key`), não `id` — não estende `BaseRepository` (pensado para linha com
 * `id` próprio). `client_id` continua sendo sempre o primeiro filtro do `where`, mesma regra.
 */
@Injectable()
export class SettingsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAllOverrides(clientId: string): Promise<Record<string, number>> {
    const { rows } = await this.pool.query<{ key: string; value: number }>(
      'select key, value from client_settings where client_id = $1',
      [clientId],
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async findOverride(clientId: string, key: string): Promise<number | null> {
    const { rows } = await this.pool.query<{ value: number }>(
      'select value from client_settings where client_id = $1 and key = $2',
      [clientId, key],
    );
    return rows[0]?.value ?? null;
  }

  async setOverride(clientId: string, key: string, value: number): Promise<void> {
    await this.pool.query(
      `insert into client_settings (client_id, key, value) values ($1, $2, $3::jsonb)
       on conflict (client_id, key) do update set value = excluded.value, updated_at = now()`,
      [clientId, key, JSON.stringify(value)],
    );
  }

  /** "Restaurar padrão": apaga o override e volta a herdar o valor da plataforma. */
  async clearOverride(clientId: string, key: string): Promise<void> {
    await this.pool.query('delete from client_settings where client_id = $1 and key = $2', [clientId, key]);
  }
}
