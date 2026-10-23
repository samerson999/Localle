import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReportsRepository } from './reports.repository';

describe('relatório de km — isolamento e cálculo', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new ReportsRepository(pool);

  let clientA: string;
  let clientB: string;
  let assetId: string;
  let rastreadorId: string;

  beforeAll(async () => {
    const a = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [
      `teste-reports-a-${randomUUID()}`,
    ]);
    const b = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [
      `teste-reports-b-${randomUUID()}`,
    ]);
    clientA = a.rows[0].id;
    clientB = b.rows[0].id;

    const asset = await pool.query<{ id: string }>(
      'insert into assets (client_id, plate) values ($1, $2) returning id',
      [clientA, 'REL1A22'],
    );
    assetId = asset.rows[0].id;

    const imei = randomUUID().replace(/-/g, '').slice(0, 15);
    const rastreador = await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [
      imei,
    ]);
    rastreadorId = rastreador.rows[0].id;

    // três posições válidas no período, odômetro crescente: 100km percorridos (1000m -> 101000m)
    const posicoes = [
      { fix: '2026-01-01T08:00:00Z', odometer: 1_000 },
      { fix: '2026-01-01T12:00:00Z', odometer: 51_000 },
      { fix: '2026-01-01T18:00:00Z', odometer: 101_000 },
    ];
    for (const [i, p] of posicoes.entries()) {
      await pool.query(
        `insert into posicoes
          (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, odometer_m)
         values ($1, $2, $3, $4, $5, $5, true, st_setsrid(st_makepoint(-34.88, -8.05), 4326), $6)`,
        [rastreadorId, i + 1, clientA, assetId, p.fix, p.odometer],
      );
    }
    // posição inválida (sem fix) não deve entrar no cálculo, mesmo com odômetro discrepante
    await pool.query(
      `insert into posicoes
        (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, odometer_m)
       values ($1, 99, $2, $3, '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z', false, st_setsrid(st_makepoint(-34.88, -8.05), 4326), 999000)`,
      [rastreadorId, clientA, assetId],
    );
  });

  afterAll(async () => {
    await pool.query('delete from posicoes where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('calcula a distância pela diferença de odômetro entre o período, ignorando posições inválidas', async () => {
    const result = await repo.kmPorAtivo(
      clientA,
      assetId,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );
    expect(result?.distancia_m).toBe(100_000);
    expect(result?.amostras).toBe(3);
  });

  it('não retorna dado do ativo de outro cliente', async () => {
    const result = await repo.kmPorAtivo(
      clientB,
      assetId,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );
    expect(result).toBeNull();
  });

  it('não inclui posições fora do período pedido', async () => {
    const result = await repo.kmPorAtivo(
      clientA,
      assetId,
      new Date('2026-01-01T09:00:00Z'),
      new Date('2026-01-01T13:00:00Z'),
    );
    expect(result?.amostras).toBe(1);
    expect(result?.distancia_m).toBe(0);
  });

  it('retorna null quando não há nenhuma posição no período', async () => {
    const result = await repo.kmPorAtivo(
      clientA,
      assetId,
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-01-02T00:00:00Z'),
    );
    expect(result).toBeNull();
  });
});
