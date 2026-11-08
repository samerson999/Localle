import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmpresaRepository } from './empresa.repository';

/** Dados do empregador contra o Postgres real: cada cliente só lê e grava a própria linha de `clients`. */
describe('empresa (dados do empregador)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new EmpresaRepository(pool);
  let clientA: string;
  let clientB: string;

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-emp-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-emp-b-${randomUUID()}`])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('começa vazio, grava e relê; o outro cliente continua vazio', async () => {
    expect(await repo.buscar(clientA)).toEqual({ razaoSocial: null, cnpj: null, endereco: null });
    const e = { razaoSocial: 'Transportes A Ltda', cnpj: '11.222.333/0001-81', endereco: 'Rua 1, Caruaru' };
    expect(await repo.salvar(clientA, e)).toEqual(e);
    expect(await repo.buscar(clientA)).toEqual(e);
    expect(await repo.buscar(clientB)).toEqual({ razaoSocial: null, cnpj: null, endereco: null });
  });

  it('cliente inexistente não lê nem grava', async () => {
    const outro = randomUUID();
    expect(await repo.buscar(outro)).toBeNull();
    expect(await repo.salvar(outro, { razaoSocial: 'x', cnpj: null, endereco: null })).toBeNull();
  });
});
