import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import { OperacoesRepository } from './operacoes.repository';

/** Operações contra o Postgres real: CRUD, nome único por cliente e isolamento por client_id. */
describe('operações', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new OperacoesRepository(pool);
  let clientA: string;
  let clientB: string;

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-op-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-op-b-${randomUUID()}`])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('cria, altera e lista com a meta de consumo como número', async () => {
    const o = await repo.criar(clientA, { nome: 'Prefeitura', metaKml: 3.5 });
    expect(o).toEqual({ id: o.id, nome: 'Prefeitura', metaKml: 3.5 });
    expect(await repo.atualizar(clientA, o.id, { nome: 'Prefeitura Caruaru', metaKml: null })).toEqual({ id: o.id, nome: 'Prefeitura Caruaru', metaKml: null });
    expect(await repo.listar(clientA)).toEqual([{ id: o.id, nome: 'Prefeitura Caruaru', metaKml: null }]);
  });

  it('nome repetido no mesmo cliente viola o unique esperado; em outro cliente pode', async () => {
    const err = await repo.criar(clientA, { nome: 'Prefeitura Caruaru', metaKml: null }).catch((e) => e);
    expect(violouUnique(err, UNIQUE.operacaoNome)).toBe(true);
    await expect(repo.criar(clientB, { nome: 'Prefeitura Caruaru', metaKml: null })).resolves.toMatchObject({ nome: 'Prefeitura Caruaru' });
  });

  it('outro cliente não vê, não altera nem apaga; o dono apaga', async () => {
    const [o] = await repo.listar(clientA);
    expect((await repo.listar(clientB)).find((x) => x.id === o.id)).toBeUndefined();
    expect(await repo.atualizar(clientB, o.id, { nome: 'x', metaKml: null })).toBeNull();
    expect(await repo.delete(clientB, o.id)).toBe(false);
    expect((await repo.listar(clientA))[0].nome).toBe('Prefeitura Caruaru');
    expect(await repo.delete(clientA, o.id)).toBe(true);
  });
});
