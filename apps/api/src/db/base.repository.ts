import { Inject } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from './pg-pool.provider';

/**
 * Única camada de acesso ao banco (docs/ARQUITETURA-BACKEND.md § 2.1): nenhuma query de domínio
 * chama o driver do Postgres diretamente. Toda subclasse herda o filtro por `client_id` em
 * find/update/delete — não dá para esquecer de aplicá-lo linha a linha.
 */
export abstract class BaseRepository<Row extends QueryResultRow> {
  protected abstract readonly table: string;

  constructor(@Inject(PG_POOL) protected readonly pool: Pool) {}

  async findMany(clientId: string, where: Partial<Row> = {}): Promise<Row[]> {
    const { clause, values } = this.whereClause(clientId, where);
    const { rows } = await this.pool.query<Row>(
      `select * from ${this.table} where ${clause}`,
      values,
    );
    return rows;
  }

  async findOne(clientId: string, where: Partial<Row>): Promise<Row | null> {
    const rows = await this.findMany(clientId, where);
    return rows[0] ?? null;
  }

  async insert(clientId: string, data: Record<string, unknown>): Promise<Row> {
    const payload = { ...data, client_id: clientId };
    const columns = Object.keys(payload);
    const values = Object.values(payload);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const { rows } = await this.pool.query<Row>(
      `insert into ${this.table} (${columns.join(', ')}) values (${placeholders.join(', ')}) returning *`,
      values,
    );
    return rows[0];
  }

  async update(clientId: string, id: string, data: Record<string, unknown>): Promise<Row | null> {
    const columns = Object.keys(data);
    if (columns.length === 0) return this.findOne(clientId, { id } as unknown as Partial<Row>);
    const assignments = columns.map((col, i) => `${col} = $${i + 1}`);
    const values = [...Object.values(data), clientId, id];
    const { rows } = await this.pool.query<Row>(
      `update ${this.table} set ${assignments.join(', ')} where client_id = $${values.length - 1} and id = $${values.length} returning *`,
      values,
    );
    return rows[0] ?? null;
  }

  async delete(clientId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `delete from ${this.table} where client_id = $1 and id = $2`,
      [clientId, id],
    );
    return (rowCount ?? 0) > 0;
  }

  private whereClause(clientId: string, where: Partial<Row>) {
    const columns = Object.keys(where);
    const values: unknown[] = [clientId, ...Object.values(where)];
    const extra = columns.map((col, i) => `${col} = $${i + 2}`);
    return { clause: ['client_id = $1', ...extra].join(' and '), values };
  }
}
