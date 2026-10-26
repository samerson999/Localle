import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FrotaReportsRepository } from './frota-reports.repository';
import { FrotaReportsService } from './frota-reports.service';

/**
 * Relatórios de frota sobre posições reais no Postgres. O cálculo em si (speedLegs, routeStats,
 * fencePassages, nearbyPasses) tem os casos de aceite em packages/shared; aqui o que está sob teste é a
 * leitura certa do banco (ordem, período, só posição válida) e o isolamento por cliente.
 */
describe('relatórios de frota', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const service = new FrotaReportsService(new FrotaReportsRepository(pool));

  let clientA: string;
  let clientB: string;
  let assetA: string;
  let rastreadorId: string;
  const periodo = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-02T00:00:00Z') };

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-relfrota-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-relfrota-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'RFT1A22') returning id", [clientA])).rows[0].id;
    rastreadorId = (await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [randomUUID().replace(/-/g, '').slice(0, 15)])).rows[0].id;
    // 10:00 parado em (-8.05,-34.88); 10:01–10:03 acima de 100 km/h indo para leste; 10:04 parado; uma
    // posição inválida no meio (não pode entrar em nada) e uma fora do período.
    const pts: [string, number, number, number, boolean][] = [
      ['2026-09-01T10:00:00Z', -8.05, -34.88, 0, true],
      ['2026-09-01T10:01:00Z', -8.05, -34.87, 110, true],
      ['2026-09-01T10:02:00Z', -8.05, -34.86, 120, true],
      ['2026-09-01T10:03:00Z', -8.05, -34.85, 105, true],
      ['2026-09-01T10:04:00Z', -8.05, -34.84, 0, false],
      ['2026-09-03T10:00:00Z', -8.05, -34.80, 150, true],
    ];
    let id = 0;
    for (const [t, lat, lon, v, ign] of pts) {
      await pool.query(
        `insert into posicoes (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, speed_kmh, ignition)
         values ($1, $2, $3, $4, $5, $5, true, st_setsrid(st_makepoint($7, $6), 4326), $8, $9)`,
        [rastreadorId, ++id, clientA, assetA, t, lat, lon, v, ign],
      );
    }
    await pool.query(
      `insert into posicoes (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, speed_kmh)
       values ($1, 99, $2, $3, '2026-09-01T10:02:30Z', '2026-09-01T10:02:30Z', false, st_setsrid(st_makepoint(0, 0), 4326), 300)`,
      [rastreadorId, clientA, assetA],
    );
    await pool.query(
      "insert into cercas (client_id, nome, tipo, forma, centro, raio_m) values ($1, 'Base', 'Matriz', 'circulo', st_setsrid(st_makepoint(-34.88, -8.05), 4326), 300)",
      [clientA],
    );
  });

  afterAll(async () => {
    await pool.query('delete from posicoes where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('velocidade: um trecho acima de 100 km/h, sem a posição inválida (300 km/h) nem a de fora do período', async () => {
    const r = await service.velocidade(clientA, null, periodo, 100);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ assetId: assetA, plate: 'RFT1A22' });
    expect(r[0].legs).toHaveLength(1);
    expect(r[0].legs[0]).toMatchObject({ vmax: 120, start: Date.parse('2026-09-01T10:01:00Z'), end: Date.parse('2026-09-01T10:03:00Z') });
  });

  it('percurso: 5 posições válidas no período, distância e motor ligado coerentes', async () => {
    const [r] = await service.percurso(clientA, [assetA], periodo);
    expect(r.posicoes).toBe(5);
    expect(r.stats.vmax).toBe(120);
    expect(r.stats.dist).toBeGreaterThan(4); // ~4,4 km de -34.88 a -34.84
    expect(r.stats.dist).toBeLessThan(5);
    expect(r.stats.engineOn).toBe(4 * 60_000);
  });

  it('cercas: passagem pela cerca do cliente (entrada 10:00, saída na primeira posição fora)', async () => {
    const [r] = await service.cercas(clientA, null, periodo, null);
    expect(r.passagens).toHaveLength(1);
    expect(r.passagens[0]).toMatchObject({ fenceName: 'Base', enter: Date.parse('2026-09-01T10:00:00Z'), exit: Date.parse('2026-09-01T10:01:00Z') });
  });

  it('passou por aqui: só a posição dentro do raio, com a distância mínima', async () => {
    const [r] = await service.passouPorAqui(clientA, null, periodo, [-8.05, -34.86], 100);
    expect(r.passagens).toHaveLength(1);
    expect(r.passagens[0].minDist).toBeLessThan(1);
    expect(r.passagens[0].speedAtClosest).toBe(120);
  });

  it('outro cliente não vê nada — nem pedindo o ativo do primeiro pelo id', async () => {
    expect(await service.velocidade(clientB, null, periodo, 0)).toEqual([]);
    expect(await service.percurso(clientB, [assetA], periodo)).toEqual([]);
    expect(await service.cercas(clientB, [assetA], periodo, null)).toEqual([]);
    expect(await service.passouPorAqui(clientB, [assetA], periodo, [-8.05, -34.86], 100)).toEqual([]);
  });
});
