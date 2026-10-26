import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { UNIQUE, violouUnique } from './pg-errors';

/** Contra o Postgres real: os nomes de constraint usados no código existem, e `violouUnique` lê o `constraint` do erro. */
describe('pg-errors', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  afterAll(() => pool.end());

  it('todo constraint referenciado em UNIQUE existe no banco (pega renomeação em migration)', async () => {
    const { rows } = await pool.query<{ nome: string }>(
      `select conname as nome from pg_constraint where contype = 'u' and connamespace = 'public'::regnamespace
       union select indexname from pg_indexes where schemaname = 'public' and indexdef like 'CREATE UNIQUE%'`,
    );
    const existentes = new Set(rows.map((r) => r.nome));
    for (const [chave, nome] of Object.entries(UNIQUE)) {
      expect(existentes.has(nome), `UNIQUE.${chave} aponta para "${nome}", que não existe no banco`).toBe(true);
    }
  });

  it('violouUnique distingue o constraint violado', async () => {
    const clientId = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-pgerr-${randomUUID()}`])).rows[0].id;
    try {
      await pool.query('insert into asset_groups (client_id, name) values ($1, $2)', [clientId, 'Frota']);
      let err: unknown;
      try {
        await pool.query('insert into asset_groups (client_id, name) values ($1, $2)', [clientId, 'Frota']);
      } catch (e) {
        err = e;
      }
      expect(violouUnique(err, UNIQUE.grupoNome)).toBe(true);
      expect(violouUnique(err, UNIQUE.pneuNumeroFogo)).toBe(false);
      expect(violouUnique(new Error('x'), UNIQUE.grupoNome)).toBe(false);
    } finally {
      await pool.query('delete from clients where id = $1', [clientId]);
    }
  });
});
