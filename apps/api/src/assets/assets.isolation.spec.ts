import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetsRepository } from './assets.repository';

/**
 * Suite exigida por docs/ARQUITETURA-BACKEND.md § 2.1 antes de qualquer dado real de múltiplos
 * clientes: para cada endpoint/query sensível, tenta ler dado de um `client_id` autenticado como
 * outro e falha o build se conseguir. Roda contra o Postgres local de verdade (infra/plataforma),
 * não um mock — o que está em teste é o `BaseRepository`, não uma simulação dele.
 */
describe('isolamento por client_id (assets)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new AssetsRepository(pool);

  let clientA: string;
  let clientB: string;
  let assetOfA: string;

  beforeAll(async () => {
    const { rows: a } = await pool.query<{ id: string }>(
      'insert into clients (name) values ($1) returning id',
      [`teste-isolamento-a-${randomUUID()}`],
    );
    const { rows: b } = await pool.query<{ id: string }>(
      'insert into clients (name) values ($1) returning id',
      [`teste-isolamento-b-${randomUUID()}`],
    );
    clientA = a[0].id;
    clientB = b[0].id;

    const asset = await repo.insert(clientA, { plate: 'ABC1D23' });
    assetOfA = asset.id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('não lista ativo de outro cliente em findMany', async () => {
    const rows = await repo.findMany(clientB);
    expect(rows.find((r) => r.id === assetOfA)).toBeUndefined();
  });

  it('não encontra ativo de outro cliente em findOne por id', async () => {
    const found = await repo.findOne(clientB, { id: assetOfA });
    expect(found).toBeNull();
  });

  it('não atualiza ativo de outro cliente', async () => {
    const updated = await repo.update(clientB, assetOfA, { plate: 'ZZZ9Z99' });
    expect(updated).toBeNull();

    const stillOriginal = await repo.findOne(clientA, { id: assetOfA });
    expect(stillOriginal?.plate).toBe('ABC1D23');
  });

  it('não apaga ativo de outro cliente', async () => {
    const deleted = await repo.delete(clientB, assetOfA);
    expect(deleted).toBe(false);

    const stillThere = await repo.findOne(clientA, { id: assetOfA });
    expect(stillThere).not.toBeNull();
  });

  it('o próprio dono enxerga e consegue alterar o ativo', async () => {
    const found = await repo.findOne(clientA, { id: assetOfA });
    expect(found?.id).toBe(assetOfA);

    const updated = await repo.update(clientA, assetOfA, { plate: 'OWN1E22' });
    expect(updated?.plate).toBe('OWN1E22');
  });
});
