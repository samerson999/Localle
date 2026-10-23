import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReportsRepository } from './reports.repository';

describe('relatórios de episódio (excesso de velocidade e paradas)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new ReportsRepository(pool);

  let clientA: string;
  let clientB: string;
  let assetId: string;
  let rastreadorId: string;

  beforeAll(async () => {
    const a = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [
      `teste-episodios-a-${randomUUID()}`,
    ]);
    const b = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [
      `teste-episodios-b-${randomUUID()}`,
    ]);
    clientA = a.rows[0].id;
    clientB = b.rows[0].id;

    const asset = await pool.query<{ id: string }>(
      'insert into assets (client_id, plate) values ($1, $2) returning id',
      [clientA, 'EPI1A22'],
    );
    assetId = asset.rows[0].id;

    const imei = randomUUID().replace(/-/g, '').slice(0, 15);
    const rastreador = await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [
      imei,
    ]);
    rastreadorId = rastreador.rows[0].id;

    // 08:00 a 08:01: 3 amostras a 100 km/h (acima de 80) -> episódio de ~60s
    // 08:02: 1 amostra isolada a 90 km/h -> episódio de 0s (não dura o suficiente)
    // 08:10 a 08:16: 4 amostras a 0 km/h -> parada de ~6min
    const pontos: Array<[number, number]> = [
      [0, 100], // offset em segundos desde 08:00, velocidade
      [30, 100],
      [60, 100],
      [90, 50], // abaixo do limite — quebra o agrupamento antes do pico isolado seguinte
      [120, 90], // acima do limite, mas sozinho: episódio de duração 0s, descartado pelo mínimo de 10s
      [600, 0],
      [720, 1],
      [840, 0],
      [960, 0],
    ];
    for (const [i, [offsetS, speed]] of pontos.entries()) {
      await pool.query(
        `insert into posicoes
          (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, speed_kmh)
         values ($1, $2, $3, $4, $5::timestamptz + ($6 || ' seconds')::interval, $5, true,
                 st_setsrid(st_makepoint(-34.88, -8.05), 4326), $7)`,
        [rastreadorId, i + 1, clientA, assetId, '2026-01-01T08:00:00Z', offsetS, speed],
      );
    }
  });

  afterAll(async () => {
    await pool.query('delete from posicoes where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  const periodo = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-02T00:00:00Z') };

  it('excessosPorAtivo agrupa amostras consecutivas acima do limite e descarta episódio curto demais', async () => {
    const episodios = await repo.excessosPorAtivo(clientA, assetId, periodo.from, periodo.to, 80, 10);
    expect(episodios).toHaveLength(1);
    expect(episodios[0].amostras).toBe(3);
    expect(episodios[0].velocidade_max).toBe(100);
    expect(episodios[0].inicio.toISOString()).toBe('2026-01-01T08:00:00.000Z');
    expect(episodios[0].fim.toISOString()).toBe('2026-01-01T08:01:00.000Z');
  });

  it('excessosPorAtivo não retorna nada se a duração mínima exigida for maior que todo episódio', async () => {
    const episodios = await repo.excessosPorAtivo(clientA, assetId, periodo.from, periodo.to, 80, 3600);
    expect(episodios).toHaveLength(0);
  });

  it('excessosPorAtivo não retorna dado de outro cliente', async () => {
    const episodios = await repo.excessosPorAtivo(clientB, assetId, periodo.from, periodo.to, 80, 10);
    expect(episodios).toHaveLength(0);
  });

  it('paradasPorAtivo agrupa posições paradas (com ruído de GPS tolerado) em um único episódio', async () => {
    const episodios = await repo.paradasPorAtivo(clientA, assetId, periodo.from, periodo.to, 5);
    expect(episodios).toHaveLength(1);
    expect(episodios[0].amostras).toBe(4);
    expect(episodios[0].inicio.toISOString()).toBe('2026-01-01T08:10:00.000Z');
    expect(episodios[0].fim.toISOString()).toBe('2026-01-01T08:16:00.000Z');
  });

  it('paradasPorAtivo não retorna nada se a duração mínima exigida for maior que a parada', async () => {
    const episodios = await repo.paradasPorAtivo(clientA, assetId, periodo.from, periodo.to, 60);
    expect(episodios).toHaveLength(0);
  });

  it('paradasPorAtivo não retorna dado de outro cliente', async () => {
    const episodios = await repo.paradasPorAtivo(clientB, assetId, periodo.from, periodo.to, 5);
    expect(episodios).toHaveLength(0);
  });
});
