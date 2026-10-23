import type { Pool, PoolClient } from 'pg';

/**
 * Mesma forma de transação já usada em `PositionsIngestService` — begin/commit/rollback/release
 * centralizados aqui para os demais services que precisam de mutação + auditoria atômicas (achado #4 da
 * auditoria de 23/10/2026).
 */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
