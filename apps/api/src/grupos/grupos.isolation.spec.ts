import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GruposRepository } from './grupos.repository';

/** Grupos de ativos contra o Postgres real: CRUD, vínculo de ativos sem IDOR e isolamento por cliente. */
describe('grupos de ativos', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new GruposRepository(pool);
  let clientA: string;
  let clientB: string;
  let assetA: string;
  let assetB: string;

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-grp-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-grp-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'GRP1A22') returning id", [clientA])).rows[0].id;
    assetB = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'GRP1B22') returning id", [clientB])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('cria, renomeia, vincula só ativos do próprio cliente e lista', async () => {
    const g = await repo.criar(clientA, 'Frota Recife');
    expect(await repo.renomear(clientA, g.id, 'Frota Recife 2')).toMatchObject({ name: 'Frota Recife 2' });
    const comAtivos = await repo.definirAtivos(clientA, g.id, [assetA, assetB]);
    expect(comAtivos!.assetIds).toEqual([assetA]); // o ativo do cliente B não entra
    expect(await repo.gruposDoAtivo(clientA, assetA)).toEqual([g.id]);
    expect(await repo.listar(clientA)).toEqual([{ id: g.id, name: 'Frota Recife 2', assetIds: [assetA] }]);
  });

  it('outro cliente não vê, não renomeia, não vincula nem apaga o grupo', async () => {
    const [g] = await repo.listar(clientA);
    expect(await repo.listar(clientB)).toEqual([]);
    expect(await repo.renomear(clientB, g.id, 'x')).toBeNull();
    expect(await repo.definirAtivos(clientB, g.id, [assetB])).toBeNull();
    expect(await repo.delete(clientB, g.id)).toBe(false);
    expect(await repo.delete(clientA, g.id)).toBe(true);
  });
});
