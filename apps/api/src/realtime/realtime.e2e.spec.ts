import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { firstValueFrom, take, toArray, type Observable } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeMessage } from '@localle/shared/realtime';
import { PositionsIngestService } from '../ingest/positions-ingest.service';
import { MonitoringRepository } from '../monitoring/monitoring.repository';
import { PositionsWorker } from '../queue/positions.worker';
import { RealtimeStreamService } from './realtime-stream.service';
import { RealtimeHub } from './realtime.hub';

/**
 * Ponta a ponta contra Redis e Postgres reais: worker → publish → stream do cliente. O que está sob
 * teste é o protocolo da § 5.2 (snapshot antes dos incrementais, `since` reenviando eventos persistidos) e
 * o isolamento por canal de tenant.
 */
describe('tempo real (Redis pub/sub + SSE stream)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
  const hub = new RealtimeHub(connection);
  const worker = new PositionsWorker(connection, new PositionsIngestService(pool), hub);
  const stream = new RealtimeStreamService(hub, new MonitoringRepository(pool));

  let clientA: string;
  let clientB: string;
  let assetId: string;
  let rastreadorId: string;
  const deviceId = 3000 + Math.floor(Math.random() * 100000);

  beforeAll(async () => {
    const a = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-rt-a-${randomUUID()}`]);
    const b = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-rt-b-${randomUUID()}`]);
    clientA = a.rows[0].id;
    clientB = b.rows[0].id;
    const asset = await pool.query<{ id: string }>('insert into assets (client_id, plate) values ($1, $2) returning id', [clientA, 'RTM1A22']);
    assetId = asset.rows[0].id;
    const r = await pool.query<{ id: string }>('insert into rastreadores (imei, traccar_device_id) values ($1, $2) returning id', [
      randomUUID().replace(/-/g, '').slice(0, 15),
      deviceId,
    ]);
    rastreadorId = r.rows[0].id;
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2026-01-01T00:00:00Z', 'teste')`,
      [clientA, rastreadorId, assetId],
    );
  });

  afterAll(async () => {
    for (const t of ['eventos', 'rastreador_comunicacao', 'ultima_posicao', 'posicoes', 'ingest_posicoes_recebidas', 'instalacoes']) {
      await pool.query(`delete from ${t} where rastreador_id = $1`, [rastreadorId]);
    }
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
    await hub.onModuleDestroy();
    connection.disconnect();
  });

  function collect(obs: Observable<RealtimeMessage>, n: number) {
    return firstValueFrom(obs.pipe(take(n), toArray()));
  }

  it('snapshot primeiro, depois a posição e o alarme ingeridos chegam incrementais ao cliente dono', async () => {
    const received: RealtimeMessage[] = [];
    let resolveSnapshot!: () => void;
    const snapshotReady = new Promise<void>((r) => (resolveSnapshot = r));
    const done = new Promise<void>((resolve) => {
      const sub = stream.open(clientA, null).subscribe((m) => {
        received.push(m);
        if (m.kind === 'snapshot') resolveSnapshot();
        if (received.length === 3) {
          sub.unsubscribe();
          resolve();
        }
      });
    });
    await snapshotReady;

    // chama o processamento do job direto: a fila em si já tem teste próprio, e um worker de outro processo
    // (ex.: a API do infra/dev rodando) poderia consumir o job e o publish não aconteceria neste processo.
    await worker.process({ id: 'teste-rt', data: {
      id: 1,
      deviceId,
      fixTime: '2026-01-01T12:00:00.000Z',
      serverTime: '2026-01-01T12:00:01.000Z',
      valid: true,
      latitude: -8.05,
      longitude: -34.88,
      speed: 10,
      attributes: { alarm: 'sos', ignition: true },
    } });
    await done;

    expect(received[0]).toEqual({ kind: 'snapshot', posicoes: [] });
    expect(received[1]).toMatchObject({ kind: 'posicao', assetId, rastreadorId, lat: -8.05, lon: -34.88, ignition: true });
    expect(received[2]).toMatchObject({ kind: 'evento', assetId, tipo: 'sos', ts: '2026-01-01T12:00:00.000Z' });
  });

  it('reconexão com since reenvia os eventos persistidos e o snapshot já traz a última posição', async () => {
    const [snapshot, evento] = await collect(stream.open(clientA, new Date('2026-01-01T00:00:00Z')), 2);
    expect(snapshot).toMatchObject({ kind: 'snapshot', posicoes: [{ assetId, rastreadorId, fixTime: '2026-01-01T12:00:00.000Z' }] });
    expect(evento).toMatchObject({ kind: 'evento', tipo: 'sos' });
  });

  it('outro cliente não recebe nada do cliente A: snapshot vazio, nenhum evento, nenhum incremental', async () => {
    const received: RealtimeMessage[] = [];
    const sub = stream.open(clientB, new Date('2026-01-01T00:00:00Z')).subscribe((m) => received.push(m));
    await firstValueFrom(stream.open(clientB, null).pipe(take(1))); // garante assinatura ativa antes de publicar

    await hub.publish(clientA, { kind: 'evento', id: 'x', assetId, tipo: 'sos', ts: new Date().toISOString() });
    // marcador publicado no canal de B depois do de A: quando ele chega, o de A já teria chegado (ordem do Redis)
    await hub.publish(clientB, { kind: 'evento', id: 'marcador', assetId: null, tipo: 'teste', ts: new Date().toISOString() });
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (received.some((m) => m.kind === 'evento' && m.id === 'marcador')) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });
    sub.unsubscribe();

    expect(received[0]).toEqual({ kind: 'snapshot', posicoes: [] });
    expect(received.slice(1)).toEqual([{ kind: 'evento', id: 'marcador', assetId: null, tipo: 'teste', ts: expect.any(String) }]);
  });
});
