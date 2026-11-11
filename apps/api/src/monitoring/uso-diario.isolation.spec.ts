import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diasAte } from './monitoring.controller';
import { MonitoringRepository } from './monitoring.repository';

// Agregado uso_5min (migration 1794270000000) + MonitoringRepository.usoDiario: o que a Home do gestor lê.
describe('monitoramento — uso diário (agregado uso_5min)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new MonitoringRepository(pool);
  const FUSO = 'America/Recife';
  const agora = new Date('2026-01-02T12:00:00Z');

  let clientA: string;
  let clientB: string;
  let assetA: string;
  let rastreadorId: string;

  // percurso conhecido em Recife: 4 pontos em movimento, 3 no bloco 10:00–10:05 e 1 no bloco seguinte (13:00Z = 10:00 local)
  const pontos: [string, number, number, number][] = [
    ['2026-01-01T13:00:00Z', -34.9000, -8.0500, 30],
    ['2026-01-01T13:02:00Z', -34.8950, -8.0500, 40],
    ['2026-01-01T13:04:00Z', -34.8900, -8.0500, 35],
    ['2026-01-01T13:06:00Z', -34.8850, -8.0500, 20],
    // parado (não soma distância nem minutos)
    ['2026-01-01T15:00:00Z', -34.8850, -8.0500, 0],
    // 01:00Z do dia 2 = 22:00 do dia 1 em Recife: conta no dia 1, não no 2
    ['2026-01-02T01:00:00Z', -34.8850, -8.0500, 0],
  ];

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-uso-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-uso-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>('insert into assets (client_id, plate) values ($1, $2) returning id', [clientA, 'USO1A22'])).rows[0].id;
    const imei = randomUUID().replace(/-/g, '').slice(0, 15);
    rastreadorId = (await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [imei])).rows[0].id;
    let n = 1;
    for (const [t, lon, lat, v] of pontos) {
      await pool.query(
        `insert into posicoes (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, speed_kmh)
         values ($1, $2, $3, $4, $5, $5, true, st_setsrid(st_makepoint($6, $7), 4326), $8)`,
        [rastreadorId, n++, clientA, assetA, t, lon, lat, v],
      );
    }
    // posições antigas ficam abaixo da marca d'água do agregado: materializa a janela do teste
    await pool.query(`call refresh_continuous_aggregate('uso_5min', '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z')`);
  });

  afterAll(async () => {
    await pool.query('delete from posicoes where rastreador_id = $1', [rastreadorId]);
    await pool.query(`call refresh_continuous_aggregate('uso_5min', '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z')`);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from assets where id = $1', [assetA]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('soma a distância da trajetória em movimento, inclusive o trecho entre blocos de 5 minutos', async () => {
    const rows = await repo.usoDiario(clientA, agora, 7, FUSO);
    const dia1 = rows.find((r) => r.asset_id === assetA && r.dia === '2026-01-01');
    expect(dia1).toBeDefined();
    const { rows: esperado } = await pool.query<{ m: number }>(
      `select st_length(st_makeline(array[
         st_makepoint(-34.9000, -8.0500), st_makepoint(-34.8950, -8.0500), st_makepoint(-34.8900, -8.0500), st_makepoint(-34.8850, -8.0500)
       ])::geography)::float8 as m`,
    );
    expect(dia1!.dist_m).toBeCloseTo(esperado[0].m, 0);
    // dois blocos com velocidade > 5 km/h (10:00 e 10:05)
    expect(dia1!.minutos_mov).toBe(10);
  });

  it('agrupa pelo dia no fuso da operação (22:00 local ainda é o mesmo dia)', async () => {
    const rows = await repo.usoDiario(clientA, agora, 7, FUSO);
    expect(rows.filter((r) => r.asset_id === assetA).map((r) => r.dia)).toEqual(['2026-01-01']);
  });

  it('outro cliente não vê o uso do ativo', async () => {
    const rows = await repo.usoDiario(clientB, agora, 7, FUSO);
    expect(rows.find((r) => r.asset_id === assetA)).toBeUndefined();
  });

  it('fora da janela pedida não entra', async () => {
    const rows = await repo.usoDiario(clientA, new Date('2026-01-20T12:00:00Z'), 7, FUSO);
    expect(rows).toEqual([]);
  });
});

describe('diasAte', () => {
  it('lista hoje e os dias anteriores no fuso, do mais antigo ao mais recente', () => {
    // 02:00Z do dia 3 = 23:00 do dia 2 em Recife
    expect(diasAte(new Date('2026-01-03T02:00:00Z'), 2, 'America/Recife')).toEqual(['2025-12-31', '2026-01-01', '2026-01-02']);
  });
});
