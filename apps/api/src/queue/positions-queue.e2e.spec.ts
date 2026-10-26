import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PositionsIngestService } from '../ingest/positions-ingest.service';
import type { TraccarPositionPayload } from '../ingest/traccar-position.mapper';
import { RealtimeHub } from '../realtime/realtime.hub';
import { PositionsQueue } from './positions.queue';
import { PositionsWorker } from './positions.worker';

/**
 * Prova a fila de ponta a ponta contra o Redis real (`infra/fila`) e o Postgres real
 * (`infra/plataforma`), sem precisar de um Traccar de verdade: enfileira um payload cru do Traccar e
 * espera o worker processar (BullMQ real, não mock) — é a lógica de `PositionsIngestService` que já tem
 * teste próprio; aqui o que está sob teste é a fiação queue → worker.
 */
// Fila própria desta execução: ver `positionsQueueName()`.
process.env.POSITIONS_QUEUE_NAME = `positions-ingest-teste-${randomUUID()}`;

describe('fila de posições (BullMQ + Redis real)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
  const queue = new PositionsQueue(connection);
  const worker = new PositionsWorker(connection, new PositionsIngestService(pool), new RealtimeHub(connection));

  let clientId: string;
  let assetId: string;
  const rastreadoresCriados: string[] = [];

  beforeAll(async () => {
    worker.onModuleInit();

    const client = await pool.query<{ id: string }>(
      'insert into clients (name) values ($1) returning id',
      [`teste-fila-${randomUUID()}`],
    );
    clientId = client.rows[0].id;
    const asset = await pool.query<{ id: string }>(
      'insert into assets (client_id, plate) values ($1, $2) returning id',
      [clientId, 'FIL1A22'],
    );
    assetId = asset.rows[0].id;
  });

  afterAll(async () => {
    await worker.onModuleDestroy();
    await queue.close();
    await pool.query('delete from clients where id = $1', [clientId]);
    await pool.end();
    connection.disconnect();
  });

  afterEach(async () => {
    while (rastreadoresCriados.length) {
      const id = rastreadoresCriados.pop()!;
      await pool.query('delete from rastreador_comunicacao where rastreador_id = $1', [id]);
      await pool.query('delete from ultima_posicao where rastreador_id = $1', [id]);
      await pool.query('delete from eventos where rastreador_id = $1', [id]);
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
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico)
       values ($1, $2, $3, '2026-01-01T00:00:00Z', 'teste')`,
      [clientId, rows[0].id, assetId],
    );
    return rows[0].id;
  }

  function payload(overrides: Partial<TraccarPositionPayload> = {}): TraccarPositionPayload {
    return {
      id: 1,
      deviceId: 1,
      fixTime: '2026-01-01T12:00:00.000Z',
      serverTime: '2026-01-01T12:00:01.000Z',
      valid: true,
      latitude: -8.05,
      longitude: -34.88,
      speed: 20, // nós
      ...overrides,
    };
  }

  async function waitFor<T>(check: () => Promise<T | null>, timeoutMs = 5000): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('timeout esperando o worker processar o job');
  }

  it('enfileira, o worker processa e a posição chega no Postgres convertida e resolvida', async () => {
    const rastreadorId = await criarRastreador(2001);
    await queue.enqueue(payload({ deviceId: 2001, id: 10 }));

    const row = await waitFor(async () => {
      const { rows } = await pool.query(
        'select * from posicoes where rastreador_id = $1 and traccar_position_id = 10',
        [rastreadorId],
      );
      return rows[0] ?? null;
    });

    expect(row.client_id).toBe(clientId);
    expect(row.asset_id).toBe(assetId);
    expect(Number(row.speed_kmh)).toBeCloseTo(20 * 1.852, 5);
  });

  it('job duplicado (mesma traccar_position_id) não gera posição duplicada', async () => {
    const rastreadorId = await criarRastreador(2002);
    await queue.enqueue(payload({ deviceId: 2002, id: 20 }));
    await queue.enqueue(payload({ deviceId: 2002, id: 20 }));

    await waitFor(async () => {
      const { rows } = await pool.query(
        'select count(*)::int as n from posicoes where rastreador_id = $1 and traccar_position_id = 20',
        [rastreadorId],
      );
      return rows[0].n === 1 ? rows[0] : null;
    });

    const { rows } = await pool.query(
      'select count(*)::int as n from posicoes where rastreador_id = $1 and traccar_position_id = 20',
      [rastreadorId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('rastreador desconhecido não derruba o worker (job completa sem exceção)', async () => {
    await queue.enqueue(payload({ deviceId: 999999, id: 1 }));

    const job = await waitFor(async () => {
      const jobs = await queue.queue.getJobs(['completed'], 0, 50);
      return jobs.find((j) => j.data.deviceId === 999999) ?? null;
    });
    expect(job).toBeDefined();
  });
});
