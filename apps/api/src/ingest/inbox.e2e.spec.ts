import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ComandosRepository } from '../comandos/comandos.repository';
import { ComandosService } from '../comandos/comandos.service';
import { PositionsWorker } from '../queue/positions.worker';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { RealtimeHub } from '../realtime/realtime.hub';
import { EventsIngestService } from './events-ingest.service';
import { InboxRepository } from './inbox.repository';
import { InboxWorker } from './inbox.worker';
import { PositionsIngestService } from './positions-ingest.service';
import { TraccarClient } from './traccar-client';
import { TraccarIngestController } from './traccar-ingest.controller';

/**
 * Forwarding do Traccar ponta a ponta contra Postgres e Redis reais: endpoint → `ingest_inbox` →
 * worker (lease) → `posicoes`/`eventos`. Cada teste parte de um inbox sem pendências (as linhas
 * pendentes de outros testes são marcadas como processadas antes), para o lote reivindicado ser o dele.
 */
describe('ingestão por Forwarding (inbox + lease)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
  const hub = new RealtimeHub(redis);
  const inbox = new InboxRepository(pool);
  const controller = new TraccarIngestController(inbox);
  const positionsWorker = new PositionsWorker(redis, new PositionsIngestService(pool), hub);
  const comandos = new ComandosService(
    new ComandosRepository(pool),
    new TraccarClient(),
    new SettingsService(new SettingsRepository(pool), pool),
    new AuditLogRepository(pool),
    hub,
    pool,
  );
  const worker = new InboxWorker(inbox, positionsWorker, new EventsIngestService(pool), hub, comandos);
  const chave = `chave-${randomUUID()}`;
  const deviceId = 700_000 + Math.floor(Math.random() * 100_000);

  let clientId: string;
  let assetId: string;
  let rastreadorId: string;
  const inboxIds: string[] = [];

  beforeAll(async () => {
    process.env.TRACCAR_INGEST_KEY = chave;
    clientId = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-inbox-${randomUUID()}`])).rows[0].id;
    assetId = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'INB1X22') returning id", [clientId])).rows[0].id;
    rastreadorId = (
      await pool.query<{ id: string }>('insert into rastreadores (imei, traccar_device_id) values ($1, $2) returning id', [
        randomUUID().replace(/-/g, '').slice(0, 15),
        deviceId,
      ])
    ).rows[0].id;
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2026-01-01T00:00:00Z', 'teste')`,
      [clientId, rastreadorId, assetId],
    );
  });

  beforeEach(async () => {
    await pool.query("update ingest_inbox set processado_em = now() where processado_em is null and payload::text like '%' || $1 || '%'", [
      String(deviceId),
    ]);
  });

  afterAll(async () => {
    delete process.env.TRACCAR_INGEST_KEY;
    await pool.query("delete from ingest_inbox where payload::text like '%' || $1 || '%'", [String(deviceId)]);
    for (const t of ['eventos', 'ingest_eventos_recebidos', 'rastreador_comunicacao', 'ultima_posicao', 'posicoes', 'ingest_posicoes_recebidas', 'instalacoes']) {
      await pool.query(`delete from ${t} where rastreador_id = $1`, [rastreadorId]);
    }
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id = $1', [clientId]);
    await pool.end();
    await hub.onModuleDestroy();
    redis.disconnect();
  });

  const posicao = (id: number) => ({
    position: {
      id,
      deviceId,
      fixTime: '2026-01-01T12:00:00.000Z',
      serverTime: '2026-01-01T12:00:01.000Z',
      valid: true,
      latitude: -8.05,
      longitude: -34.88,
      speed: 10,
      attributes: {},
    },
    device: { id: deviceId, name: 'x', uniqueId: 'y' },
  });
  const evento = (id: number, type: string) => ({
    event: { id, deviceId, type, eventTime: '2026-01-01T12:00:00.000Z', attributes: {} },
  });

  async function processarAteEsvaziar() {
    while ((await worker.processarLote(50)) > 0);
  }

  it('recusa sem chave, com chave errada e sem TRACCAR_INGEST_KEY configurado (401, nada no inbox)', async () => {
    await expect(controller.positions(undefined, posicao(1))).rejects.toMatchObject({ status: 401 });
    await expect(controller.positions('errada', posicao(1))).rejects.toMatchObject({ status: 401 });
    delete process.env.TRACCAR_INGEST_KEY;
    try {
      await expect(controller.positions(chave, posicao(1))).rejects.toMatchObject({ status: 401 });
    } finally {
      process.env.TRACCAR_INGEST_KEY = chave;
    }
    const { rowCount } = await pool.query("select 1 from ingest_inbox where payload::text like '%' || $1 || '%'", [String(deviceId)]);
    expect(rowCount).toBe(0);
  });

  it('recusa payload sem os campos mínimos com 400', async () => {
    await expect(controller.positions(chave, { position: { id: 1 } })).rejects.toMatchObject({ status: 400 });
    await expect(controller.positions(chave, { position: { ...posicao(1).position, latitude: 'x' } })).rejects.toMatchObject({ status: 400 });
    await expect(controller.events(chave, { event: { id: 1, deviceId } })).rejects.toMatchObject({ status: 400 });
  });

  it('posição/evento com id 0 (Traccar 6 envia antes de gravar) volta 503 para reenvio, sem entrar no inbox', async () => {
    await expect(controller.positions(chave, posicao(0))).rejects.toMatchObject({ status: 503 });
    await expect(controller.events(chave, evento(0, 'ignitionOn'))).rejects.toMatchObject({ status: 503 });
    // sem chave continua 401: a autenticação vem antes
    await expect(controller.positions(undefined, posicao(0))).rejects.toMatchObject({ status: 401 });
    const { rowCount } = await pool.query("select 1 from ingest_inbox where payload::text like '%' || $1 || '%'", [String(deviceId)]);
    expect(rowCount).toBe(0);
  });

  it('posição aceita vai para o inbox (só o objeto position) e o worker grava em posicoes; reenvio não duplica', async () => {
    await controller.positions(chave, posicao(11));
    await controller.positions(chave, posicao(11)); // retry do Traccar
    const { rows } = await pool.query(
      "select payload from ingest_inbox where processado_em is null and payload::text like '%' || $1 || '%'",
      [String(deviceId)],
    );
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0].payload)).toEqual(['position']);

    await processarAteEsvaziar();
    const gravadas = await pool.query('select client_id, asset_id from posicoes where rastreador_id = $1 and traccar_position_id = 11', [rastreadorId]);
    expect(gravadas.rows).toEqual([{ client_id: clientId, asset_id: assetId }]);
  });

  it('evento ignitionOn é gravado com traccar_event_id e posicao_id; repetido não duplica; alarm é ignorado', async () => {
    await controller.positions(chave, posicao(21));
    await processarAteEsvaziar();
    await controller.events(chave, { event: { ...evento(501, 'ignitionOn').event, positionId: 21 } });
    await controller.events(chave, { event: { ...evento(501, 'ignitionOn').event, positionId: 21 } });
    await controller.events(chave, evento(502, 'alarm'));
    await processarAteEsvaziar();

    const { rows } = await pool.query(
      'select tipo, traccar_event_id, client_id, posicao_id is not null as tem_posicao from eventos where rastreador_id = $1 and traccar_event_id is not null',
      [rastreadorId],
    );
    expect(rows).toEqual([{ tipo: 'ignitionOn', traccar_event_id: '501', client_id: clientId, tem_posicao: true }]);
    const pendentes = await pool.query(
      "select 1 from ingest_inbox where processado_em is null and payload::text like '%' || $1 || '%'",
      [String(deviceId)],
    );
    expect(pendentes.rowCount).toBe(0);
  });

  it('falha de processamento registra o erro e devolve a linha com backoff (não fica perdida nem em loop)', async () => {
    // payload gravado direto (pulando o controller) para simular dado que quebra no worker
    const { rows } = await pool.query<{ id: string }>(
      "insert into ingest_inbox (tipo, payload) values ('posicao', $1) returning id",
      [{ position: { id: 1, deviceId, fixTime: 'quebrado' } }],
    );
    inboxIds.push(rows[0].id);
    await worker.processarLote(50);
    const linha = (await pool.query('select processado_em, erro, tentativas, lease_expira_em > now() as em_espera from ingest_inbox where id = $1', [rows[0].id])).rows[0];
    expect(linha.processado_em).toBeNull();
    expect(linha.erro).toBeTruthy();
    expect(linha.tentativas).toBe(1);
    expect(linha.em_espera).toBe(true);
    // em espera: o próximo lote não a pega de novo imediatamente
    expect(await inbox.reivindicar('outro-worker', 50)).not.toContainEqual(expect.objectContaining({ id: rows[0].id }));
  });

  it('dois workers concorrentes nunca reivindicam a mesma linha; lease vencido volta a ser elegível', async () => {
    for (let i = 0; i < 10; i++) await controller.positions(chave, posicao(100 + i));
    const [a, b] = await Promise.all([inbox.reivindicar('w-a', 6), inbox.reivindicar('w-b', 6)]);
    const idsA = a.map((r) => r.id);
    const idsB = b.map((r) => r.id);
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    expect(idsA.length + idsB.length).toBe(10);

    // w-a "morreu": vence o lease dele e outro worker assume
    await pool.query('update ingest_inbox set lease_expira_em = now() - interval \'1 second\' where id = any($1)', [idsA]);
    const c = await inbox.reivindicar('w-c', 50);
    expect(c.map((r) => r.id).sort()).toEqual([...idsA].sort());
    expect(c.every((r) => r.tentativas === 2)).toBe(true);
  });
});
