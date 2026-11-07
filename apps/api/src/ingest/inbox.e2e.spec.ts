import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ComandosRepository } from '../comandos/comandos.repository';
import { ComandosService } from '../comandos/comandos.service';
import { ProcessadorPosicao } from './processador-posicao';
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
  const positionsWorker = new ProcessadorPosicao(new PositionsIngestService(pool), hub);
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

  /**
   * Processa até não sobrar linha pendente deste device. Um worker do inbox de fora (a API local ligada no mesmo banco)
   * pode estar no meio de uma linha nossa: então, além de processar, espera ela terminar (até 10 s) em vez de afirmar
   * sobre quem processou — o que importa é o resultado no banco.
   */
  async function processarAteEsvaziar() {
    const limite = Date.now() + 10_000;
    for (;;) {
      while ((await worker.processarLote(50)) > 0);
      const { rowCount } = await pool.query(
        "select 1 from ingest_inbox where processado_em is null and tentativas < 10 and payload::text like '%' || $1 || '%'",
        [String(deviceId)],
      );
      if (!rowCount) return;
      if (Date.now() > limite) throw new Error(`${rowCount} linha(s) do device ${deviceId} ainda pendentes depois de 10 s`);
      await new Promise((r) => setTimeout(r, 100));
    }
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
    // todas as linhas da posição 11, processadas ou não (um worker de fora pode já ter pegado)
    const { rows } = await pool.query(
      "select payload from ingest_inbox where (payload->'position'->>'id')::int = 11 and payload::text like '%' || $1 || '%'",
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

  it('formato inválido é recusado na admissão: concluída na hora, com o motivo na linha, sem retry', async () => {
    // payload gravado direto (pulando o controller) para simular dado que o validador do endpoint não deixaria passar
    const { rows } = await pool.query<{ id: string }>(
      "insert into ingest_inbox (tipo, payload) values ('posicao', $1) returning id",
      [{ position: { id: 1, deviceId, fixTime: 'quebrado' } }],
    );
    inboxIds.push(rows[0].id);
    await worker.processarLote(50);
    const linha = (await pool.query('select processado_em, erro, tentativas from ingest_inbox where id = $1', [rows[0].id])).rows[0];
    expect(linha.processado_em).not.toBeNull();
    expect(linha.erro).toMatch(/^recusada: Posição inválida: fixTime="quebrado"/);
    expect(linha.tentativas).toBe(1);
  });

  it('falha de processamento (ex.: banco) registra o erro e devolve a linha com backoff (não fica perdida nem em loop)', async () => {
    const quebra = { processar: async () => { throw new Error('connection terminated unexpectedly'); } } as unknown as ProcessadorPosicao;
    const comFalha = new InboxWorker(inbox, quebra, new EventsIngestService(pool), hub, comandos);
    await controller.positions(chave, posicao(77));
    const { rows } = await pool.query<{ id: string }>(
      "select id from ingest_inbox where processado_em is null and (payload->'position'->>'id')::int = 77 and payload::text like '%' || $1 || '%'",
      [String(deviceId)],
    );
    await comFalha.processarLote(50);
    const linha = (await pool.query('select processado_em, erro, tentativas, lease_expira_em > now() as em_espera from ingest_inbox where id = $1', [rows[0].id])).rows[0];
    expect(linha.processado_em).toBeNull();
    expect(linha.erro).toBe('connection terminated unexpectedly');
    expect(linha.tentativas).toBe(1);
    expect(linha.em_espera).toBe(true);
    // em espera: o próximo lote não a pega de novo imediatamente
    expect(await inbox.reivindicar('outro-worker', 50)).not.toContainEqual(expect.objectContaining({ id: rows[0].id }));
  });

  it('dois workers concorrentes nunca reivindicam a mesma linha; lease vencido volta a ser elegível', async () => {
    // nascem com lease (nenhum worker local as pega) e são liberadas logo antes das duas reivindicações simultâneas
    const { rows: criadas } = await pool.query<{ id: string }>(
      `insert into ingest_inbox (tipo, payload, lease_por, lease_expira_em)
       select 'posicao', jsonb_build_object('position', $1::jsonb || jsonb_build_object('id', 100 + g)), 'teste', now() + interval '1 hour'
         from generate_series(0, 9) g returning id`,
      [JSON.stringify(posicao(0).position)],
    );
    await pool.query('update ingest_inbox set lease_por = null, lease_expira_em = null where id = any($1)', [criadas.map((r) => r.id)]);
    const [a, b] = await Promise.all([inbox.reivindicar('w-a', 6), inbox.reivindicar('w-b', 6)]);
    // só as linhas deste teste (outro arquivo rodando em paralelo pode ter pendentes no mesmo inbox)
    const nossas = new Set(criadas.map((r) => r.id));
    const idsA = a.map((r) => r.id).filter((id) => nossas.has(id));
    const idsB = b.map((r) => r.id).filter((id) => nossas.has(id));
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    expect(idsA.length + idsB.length).toBe(10);

    // w-a "morreu": vence o lease dele e outro worker assume
    await pool.query('update ingest_inbox set lease_expira_em = now() - interval \'1 second\' where id = any($1)', [idsA]);
    const c = (await inbox.reivindicar('w-c', 50)).filter((r) => nossas.has(r.id));
    expect(c.map((r) => r.id).sort()).toEqual([...idsA].sort());
    expect(c.every((r) => r.tentativas === 2)).toBe(true);
    await pool.query('update ingest_inbox set processado_em = now() where id = any($1)', [[...nossas]]);
  });

  it('tempo real antes das recuperadas pela conciliação, mas as recuperadas sempre têm a reserva do lote', async () => {
    // Determinístico mesmo com outros workers e outros arquivos de teste no mesmo inbox: tudo numa transação (as linhas não
    // existem para os outros até o fim) e reivindicando por uma faixa de 1000 onde só o aparelho deste teste cai.
    const tx = await pool.connect();
    try {
      await tx.query('begin');
      const repoTx = new InboxRepository(tx as unknown as Pool);
      const { rows: [{ indice }] } = await tx.query<{ indice: number }>("select (hashtext($1) & 2147483647) % 1000 as indice", [String(deviceId)]);
      const faixa = { indice, total: 1000 };
      const inserir = (id: number, prioridade: number) =>
        tx.query(`insert into ingest_inbox (tipo, payload, prioridade) values ('posicao', $1, $2)`, [{ position: { ...posicao(0).position, id } }, prioridade]);
      // recuperadas entram ANTES (ids menores): sem prioridade, um backlog de recuperação atrasaria o mapa
      for (const id of [301, 302, 303]) await inserir(id, 1);
      for (const id of [200, 201, 202]) await inserir(id, 0);
      const idDoPayload = (r: { payload: unknown }) => (r.payload as { position: { id: number } }).position.id;

      const lote = await repoTx.reivindicar('w-p', 2, 120, 1, faixa);
      // 2 de tempo real (limite) + 1 recuperada (reserva)
      expect(lote.map(idDoPayload).sort()).toEqual([200, 201, 301]);

      // sem tempo real pendente, as recuperadas preenchem o lote inteiro
      await tx.query("update ingest_inbox set processado_em = now() where prioridade = 0 and processado_em is null and payload::text like '%' || $1 || '%'", [String(deviceId)]);
      const so = await repoTx.reivindicar('w-p', 2, 120, 1, faixa);
      expect(so.map(idDoPayload).sort()).toEqual([302, 303]);
    } finally {
      await tx.query('rollback');
      tx.release();
    }
  });

  it('desligamento no meio do lote: termina a linha em andamento e devolve as outras sem gastar tentativa', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into ingest_inbox (tipo, payload, lease_por, lease_expira_em)
       select 'posicao', jsonb_build_object('position', $1::jsonb || jsonb_build_object('id', 400 + g)), 'teste', now() + interval '1 hour'
         from generate_series(1, 3) g returning id`,
      [JSON.stringify(posicao(0).position)],
    );
    const ids = rows.map((r) => r.id);
    const processadas: number[] = [];
    let desligavel: InboxWorker;
    // a 1ª linha recebe o SIGTERM no meio do processamento
    const fake = {
      processar: async (bruta: { id: number }) => {
        processadas.push(bruta.id);
        void desligavel.onModuleDestroy();
        return { status: 'deduped' };
      },
    } as unknown as ProcessadorPosicao;
    // Tudo numa transação: as linhas devolvidas só ficam visíveis para outros workers (a API local ligada no mesmo banco)
    // depois da verificação. Reivindica exatamente as linhas do teste; o que está sob teste é o worker no desligamento e o
    // SQL de devolver, não a reivindicação.
    const tx = await pool.connect();
    try {
      await tx.query('begin');
      const repoTx = new InboxRepository(tx as unknown as Pool);
      const soAsDoTeste = Object.assign(Object.create(repoTx) as InboxRepository, {
        reivindicar: async () =>
          (
            await tx.query(
              `update ingest_inbox set lease_por = 'w-desliga', tentativas = tentativas + 1 where id = any($1)
               returning id, tipo, payload, tentativas`,
              [ids],
            )
          ).rows.sort((x, y) => Number(x.id) - Number(y.id)),
      });
      desligavel = new InboxWorker(soAsDoTeste, fake, new EventsIngestService(pool), hub, comandos);
      await desligavel.processarLote(3);

      expect(processadas).toEqual([401]);
      const { rows: estado } = await tx.query<{ id: string; processado_em: Date | null; lease_por: string | null; tentativas: number }>(
        'select id, processado_em, lease_por, tentativas from ingest_inbox where id = any($1) order by id',
        [ids],
      );
      expect(estado[0].processado_em).not.toBeNull();
      // as duas que nem começaram: elegíveis já (sem lease) e sem tentativa gasta
      expect(estado.slice(1).map((e) => [e.processado_em, e.lease_por, e.tentativas])).toEqual([[null, null, 0], [null, null, 0]]);
    } finally {
      await tx.query('rollback');
      tx.release();
    }
    await pool.query('update ingest_inbox set processado_em = now() where id = any($1)', [ids]);
  });

  it('faixas: cada aparelho cai sempre na mesma faixa e nenhuma linha é reivindicada por duas', async () => {
    // numa transação: as linhas só existem para este teste (outros workers ligados no mesmo banco não as pegam)
    const tx = await pool.connect();
    try {
      await tx.query('begin');
      const repoTx = new InboxRepository(tx as unknown as Pool);
      // 12 aparelhos × 3 posições
      const base = 900_000 + Math.floor(Math.random() * 50_000);
      const { rows } = await tx.query<{ id: string }>(
        `insert into ingest_inbox (tipo, payload)
         select 'posicao', jsonb_build_object('position', jsonb_build_object('id', p, 'deviceId', $1::int + d, 'marca', 'faixas'))
           from generate_series(1, 12) d, generate_series(1, 3) p returning id`,
        [base],
      );
      const ids = new Set(rows.map((r) => r.id));
      const lotes = [];
      for (const indice of [0, 1, 2, 3]) lotes.push(await repoTx.reivindicar(`w-faixa-${indice}`, 100, 120, 10, { indice, total: 4 }));
      const nossas = lotes.map((l) => l.filter((r) => ids.has(r.id)));

      const todas = nossas.flat().map((r) => r.id);
      expect(new Set(todas).size).toBe(todas.length); // nenhuma em duas faixas
      expect(todas.length).toBe(36);
      const faixaDoAparelho = new Map<number, number>();
      nossas.forEach((lote, indice) => {
        for (const r of lote) {
          const d = (r.payload as { position: { deviceId: number } }).position.deviceId;
          expect(faixaDoAparelho.get(d) ?? indice).toBe(indice);
          faixaDoAparelho.set(d, indice);
        }
      });
      // com 12 aparelhos, mais de uma faixa é usada (senão não haveria paralelismo nenhum)
      expect(new Set(faixaDoAparelho.values()).size).toBeGreaterThan(1);
    } finally {
      await tx.query('rollback');
      tx.release();
    }
  });
});
