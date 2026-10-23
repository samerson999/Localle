import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PositionsIngestService } from './positions-ingest.service';
import type { NormalizedPosition } from './traccar-position.mapper';

describe('PositionsIngestService', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const service = new PositionsIngestService(pool);

  let clientId: string;
  let assetId: string;
  const rastreadoresCriados: string[] = [];

  beforeAll(async () => {
    const client = await pool.query<{ id: string }>(
      'insert into clients (name) values ($1) returning id',
      [`teste-ingest-${randomUUID()}`],
    );
    clientId = client.rows[0].id;
    const asset = await pool.query<{ id: string }>(
      'insert into assets (client_id, plate) values ($1, $2) returning id',
      [clientId, 'ING1E22'],
    );
    assetId = asset.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id = $1', [clientId]);
    await pool.end();
  });

  afterEach(async () => {
    while (rastreadoresCriados.length) {
      const id = rastreadoresCriados.pop()!;
      await pool.query('delete from rastreador_comunicacao where rastreador_id = $1', [id]);
      await pool.query('delete from ultima_posicao where rastreador_id = $1', [id]);
      await pool.query('delete from posicoes where rastreador_id = $1', [id]);
      await pool.query('delete from ingest_posicoes_recebidas where rastreador_id = $1', [id]);
      await pool.query('delete from instalacoes where rastreador_id = $1', [id]);
      await pool.query('delete from rastreadores where id = $1', [id]);
    }
  });

  async function criarRastreador(traccarDeviceId: number) {
    const imei = randomUUID().replace(/-/g, '').slice(0, 15);
    const { rows } = await pool.query<{ id: string }>(
      'insert into rastreadores (imei, traccar_device_id) values ($1, $2) returning id',
      [imei, traccarDeviceId],
    );
    rastreadoresCriados.push(rows[0].id);
    return rows[0].id;
  }

  async function instalar(rastreadorId: string, instaladoEm: string) {
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico)
       values ($1, $2, $3, $4, 'teste')`,
      [clientId, rastreadorId, assetId, instaladoEm],
    );
  }

  function position(overrides: Partial<NormalizedPosition> = {}): NormalizedPosition {
    return {
      traccarDeviceId: 1,
      traccarPositionId: 1,
      fixTime: new Date('2026-01-01T12:00:00Z'),
      serverTime: new Date('2026-01-01T12:00:01Z'),
      valid: true,
      longitude: -34.88,
      latitude: -8.05,
      speedKmh: 40,
      course: 90,
      altitude: 10,
      odometerM: 1000,
      ignition: true,
      attributes: { foo: 'bar' },
      ...overrides,
    };
  }

  it('descarta posição de rastreador não cadastrado (traccar_device_id desconhecido)', async () => {
    const result = await service.ingest(position({ traccarDeviceId: 999999 }));
    expect(result.status).toBe('rastreador_desconhecido');
  });

  it('grava a posição e não resolve client_id/asset_id sem instalação vigente', async () => {
    const rastreadorId = await criarRastreador(1001);
    const result = await service.ingest(position({ traccarDeviceId: 1001, traccarPositionId: 1 }));
    expect(result).toMatchObject({ status: 'gravada', clientId: null, assetId: null });

    const { rows } = await pool.query('select client_id, asset_id from posicoes where rastreador_id = $1', [
      rastreadorId,
    ]);
    expect(rows[0]).toEqual({ client_id: null, asset_id: null });
  });

  it('resolve client_id/asset_id pela instalação vigente no fix_time', async () => {
    const rastreadorId = await criarRastreador(1002);
    await instalar(rastreadorId, '2026-01-01T00:00:00Z');

    const result = await service.ingest(
      position({ traccarDeviceId: 1002, traccarPositionId: 1, fixTime: new Date('2026-01-01T12:00:00Z') }),
    );
    expect(result).toMatchObject({ status: 'gravada', clientId, assetId });
  });

  it('não resolve cliente para posição anterior à instalação', async () => {
    const rastreadorId = await criarRastreador(1003);
    await instalar(rastreadorId, '2026-01-10T00:00:00Z');

    const result = await service.ingest(
      position({ traccarDeviceId: 1003, traccarPositionId: 1, fixTime: new Date('2026-01-05T00:00:00Z') }),
    );
    expect(result).toMatchObject({ status: 'gravada', clientId: null, assetId: null });
  });

  it('dedup: a mesma traccar_position_id não grava a posição duas vezes', async () => {
    await criarRastreador(1004);

    const primeira = await service.ingest(position({ traccarDeviceId: 1004, traccarPositionId: 55 }));
    expect(primeira.status).toBe('gravada');

    const segunda = await service.ingest(position({ traccarDeviceId: 1004, traccarPositionId: 55 }));
    expect(segunda.status).toBe('deduped');

    const { rows } = await pool.query(
      'select count(*)::int as n from posicoes where rastreador_id = (select id from rastreadores where traccar_device_id = 1004)',
    );
    expect(rows[0].n).toBe(1);
  });

  it('ultima_posicao só atualiza quando a nova posição é mais recente', async () => {
    const rastreadorId = await criarRastreador(1005);

    await service.ingest(
      position({ traccarDeviceId: 1005, traccarPositionId: 1, fixTime: new Date('2026-01-01T12:00:00Z'), speedKmh: 50 }),
    );
    await service.ingest(
      position({ traccarDeviceId: 1005, traccarPositionId: 2, fixTime: new Date('2026-01-01T11:00:00Z'), speedKmh: 99 }),
    );

    const { rows } = await pool.query('select speed_kmh from ultima_posicao where rastreador_id = $1', [
      rastreadorId,
    ]);
    expect(Number(rows[0].speed_kmh)).toBe(50);
  });

  it('posição inválida (sem fix de GPS) não atualiza ultima_posicao, mas atualiza rastreador_comunicacao', async () => {
    const rastreadorId = await criarRastreador(1006);

    await service.ingest(
      position({ traccarDeviceId: 1006, traccarPositionId: 1, valid: false, fixTime: new Date('2026-01-01T12:00:00Z') }),
    );

    const ultimaPosicao = await pool.query('select * from ultima_posicao where rastreador_id = $1', [rastreadorId]);
    expect(ultimaPosicao.rowCount).toBe(0);

    const comunicacao = await pool.query(
      'select ultimo_pacote_em, ultima_posicao_valida_em from rastreador_comunicacao where rastreador_id = $1',
      [rastreadorId],
    );
    expect(comunicacao.rows[0].ultimo_pacote_em).not.toBeNull();
    expect(comunicacao.rows[0].ultima_posicao_valida_em).toBeNull();
  });
});
