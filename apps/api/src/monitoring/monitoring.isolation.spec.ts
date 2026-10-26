import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MonitoringRepository } from './monitoring.repository';

describe('monitoramento — frota atual e histórico', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new MonitoringRepository(pool);

  let clientA: string;
  let clientB: string;
  let assetComPosicao: string;
  let assetAguardando: string;
  let rastreadorId: string;

  beforeAll(async () => {
    const a = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [
      `teste-monitor-a-${randomUUID()}`,
    ]);
    const b = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [
      `teste-monitor-b-${randomUUID()}`,
    ]);
    clientA = a.rows[0].id;
    clientB = b.rows[0].id;

    const asset1 = await pool.query<{ id: string }>(
      'insert into assets (client_id, plate) values ($1, $2) returning id',
      [clientA, 'MON1A22'],
    );
    assetComPosicao = asset1.rows[0].id;
    const asset2 = await pool.query<{ id: string }>(
      'insert into assets (client_id, plate) values ($1, $2) returning id',
      [clientA, 'MON2A22'],
    );
    assetAguardando = asset2.rows[0].id;

    const imei = randomUUID().replace(/-/g, '').slice(0, 15);
    const rastreador = await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [
      imei,
    ]);
    rastreadorId = rastreador.rows[0].id;

    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico)
       values ($1, $2, $3, '2026-01-01T00:00:00Z', 'teste')`,
      [clientA, rastreadorId, assetComPosicao],
    );
    await pool.query(
      `insert into ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom, speed_kmh)
       values ($1, $2, $3, 1, '2026-01-01T12:00:00Z', st_setsrid(st_makepoint(-34.88, -8.05), 4326), 42)`,
      [rastreadorId, assetComPosicao, clientA],
    );

    await pool.query(
      `insert into rastreador_comunicacao (rastreador_id, asset_id, client_id, ultimo_pacote_em, ultima_posicao_valida_em)
       values ($1, $2, $3, '2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z')`,
      [rastreadorId, assetComPosicao, clientA],
    );
    await pool.query(
      `insert into eventos (rastreador_id, client_id, asset_id, origem, tipo, ts, posicao_id)
       values ($1, $2, $3, 'aparelho', 'sos', '2026-01-01T12:00:00Z', null)`,
      [rastreadorId, clientA, assetComPosicao],
    );

    // histórico: duas posições no período
    await pool.query(
      `insert into posicoes
        (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, speed_kmh)
       values
        ($1, 1, $2, $3, '2026-01-01T08:00:00Z', '2026-01-01T08:00:00Z', true, st_setsrid(st_makepoint(-34.88, -8.05), 4326), 10),
        ($1, 2, $2, $3, '2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z', true, st_setsrid(st_makepoint(-34.80, -8.00), 4326), 42)`,
      [rastreadorId, clientA, assetComPosicao],
    );
  });

  afterAll(async () => {
    await pool.query('delete from posicoes where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from eventos where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from rastreador_comunicacao where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from ultima_posicao where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from instalacoes where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('frotaAtual traz todos os ativos do cliente, mesmo sem posição ("aguardando primeira posição")', async () => {
    const rows = await repo.frotaAtual(clientA);
    expect(rows).toHaveLength(2);

    const comPosicao = rows.find((r) => r.asset_id === assetComPosicao);
    expect(comPosicao?.fix_time).not.toBeNull();
    expect(comPosicao?.latitude).toBeCloseTo(-8.05, 2);

    const aguardando = rows.find((r) => r.asset_id === assetAguardando);
    expect(aguardando?.fix_time).toBeNull();
    expect(aguardando?.latitude).toBeNull();
  });

  it('frotaAtual deixa de fora ativo vendido/baixado', async () => {
    await pool.query("update assets set status = 'baixado' where id = $1", [assetAguardando]);
    try {
      const rows = await repo.frotaAtual(clientA);
      expect(rows.map((r) => r.asset_id)).toEqual([assetComPosicao]);
    } finally {
      await pool.query("update assets set status = 'ativo' where id = $1", [assetAguardando]);
    }
  });

  it('frotaAtual não traz ativo de outro cliente', async () => {
    const rows = await repo.frotaAtual(clientB);
    expect(rows).toHaveLength(0);
  });

  it('historicoDoAtivo retorna as posições do período em ordem crescente', async () => {
    const rows = await repo.historicoDoAtivo(
      clientA,
      assetComPosicao,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].fix_time.toISOString()).toBe('2026-01-01T08:00:00.000Z');
    expect(rows[1].fix_time.toISOString()).toBe('2026-01-01T12:00:00.000Z');
    // regressão: o Replay e o relatório de motor precisam da ignição de cada ponto (antes não vinha)
    expect(rows[0]).toHaveProperty('ignition');
  });

  it('historicoDoAtivo não retorna nada para outro cliente', async () => {
    const rows = await repo.historicoDoAtivo(
      clientB,
      assetComPosicao,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );
    expect(rows).toHaveLength(0);
  });

  it("frotaAtual traz rastreador e último pacote da instalação vigente; ativo sem instalação vem null", async () => {
    const rows = await repo.frotaAtual(clientA);
    const comPosicao = rows.find((r) => r.asset_id === assetComPosicao);
    expect(comPosicao?.rastreador_id).toBe(rastreadorId);
    expect(comPosicao?.ultimo_pacote_em?.toISOString()).toBe("2026-01-01T12:00:00.000Z");
    const aguardando = rows.find((r) => r.asset_id === assetAguardando);
    expect(aguardando?.rastreador_id).toBeNull();
    expect(aguardando?.ultimo_pacote_em).toBeNull();
  });

  it("eventos traz os eventos do cliente no período, com placa, e filtra por ativo", async () => {
    const periodo = [new Date("2026-01-01T00:00:00Z"), new Date("2026-01-02T00:00:00Z")] as const;
    const todos = await repo.eventos(clientA, ...periodo, null);
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ tipo: "sos", plate: "MON1A22", asset_id: assetComPosicao });
    expect(await repo.eventos(clientA, ...periodo, assetAguardando)).toHaveLength(0);
  });

  it("eventos não retorna nada para outro cliente, nem filtrando pelo ativo do primeiro", async () => {
    const periodo = [new Date("2026-01-01T00:00:00Z"), new Date("2026-01-02T00:00:00Z")] as const;
    expect(await repo.eventos(clientB, ...periodo, null)).toHaveLength(0);
    expect(await repo.eventos(clientB, ...periodo, assetComPosicao)).toHaveLength(0);
  });
});
