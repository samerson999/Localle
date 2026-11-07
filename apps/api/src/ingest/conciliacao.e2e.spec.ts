import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConciliacaoRepository } from './conciliacao.repository';
import { ConciliacaoService } from './conciliacao.service';
import { InboxRepository } from './inbox.repository';
import type { TraccarClient, TraccarConfig, TraccarDevice } from './traccar-client';
import type { TraccarPositionPayload } from './traccar-position.mapper';

/**
 * Traccar em memória no seam do TraccarClient (só os dois métodos que a conciliação usa); o resto é Postgres real —
 * o que está sob teste é o diff contra `ingest_posicoes_recebidas`/inbox e o checkpoint transacional. O teste ponta a
 * ponta com o Traccar 6.17.0 de verdade está no relatório da tarefa (cenário de 2 min de API fora).
 *
 * Outro worker do inbox ligado no mesmo banco (a API local) pode processar as linhas no meio do teste: por isso as
 * contagens somam "já gravadas + já no inbox" e a prova de duplicidade é sobre todas as linhas do device, processadas
 * ou não.
 */
class TraccarFalso {
  posicoes: TraccarPositionPayload[] = [];
  lastUpdate: string | null = null;
  consultas: { from: Date; to: Date }[] = [];
  falharNaConsulta: number | null = null;
  constructor(readonly deviceId: number) {}

  async listDevices(): Promise<TraccarDevice[]> {
    return [{ id: this.deviceId, uniqueId: String(this.deviceId), name: 'teste', lastUpdate: this.lastUpdate }];
  }

  async positionsBetween(_c: TraccarConfig, deviceId: number, from: Date, to: Date): Promise<TraccarPositionPayload[]> {
    this.consultas.push({ from, to });
    if (this.falharNaConsulta === this.consultas.length) throw new Error('Traccar GET /api/positions falhou: 503');
    // o Traccar filtra por fixTime, inclusive nas duas pontas
    return this.posicoes.filter((p) => p.deviceId === deviceId && Date.parse(p.fixTime) >= from.getTime() && Date.parse(p.fixTime) <= to.getTime());
  }
}

describe('conciliação com o Traccar', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new ConciliacaoRepository(pool);
  let deviceId = 0;
  const env = { ...process.env };
  let traccar: TraccarFalso;
  let service: ConciliacaoService;
  let rastreadorId: string;
  const agora = new Date();
  const min = (n: number) => new Date(agora.getTime() - n * 60_000);
  // meio minuto fora da grade: o Traccar inclui as duas pontas, e uma posição exatamente na fronteira seria conferida duas vezes
  const fix = (n: number) => new Date(agora.getTime() - n * 60_000 - 30_000);

  const posicao = (id: number, fix: Date, o: Partial<TraccarPositionPayload> = {}): TraccarPositionPayload => ({
    id, deviceId, fixTime: fix.toISOString(), serverTime: new Date(fix.getTime() + 1000).toISOString(), valid: true,
    latitude: -8.05, longitude: -34.9, speed: 10, protocol: 'osmand', attributes: {}, ...o,
  });

  const linhasDoDevice = async () =>
    (
      await pool.query<{ id: string; prioridade: number; origem: string | null }>(
        `select (payload->'position'->>'id') as id, prioridade, payload->>'origem' as origem from ingest_inbox
          where (payload->'position'->>'deviceId')::bigint = $1`,
        [deviceId],
      )
    ).rows;
  const checkpoint = async () =>
    (await pool.query<{ conciliado_ate: Date }>('select conciliado_ate from ingest_conciliacao_checkpoints where rastreador_id = $1', [rastreadorId])).rows[0]
      ?.conciliado_ate ?? null;

  beforeAll(async () => {
    Object.assign(process.env, {
      TRACCAR_URL: 'http://traccar-falso', TRACCAR_USER: 'u', TRACCAR_PASSWORD: 'p',
      CONCILIACAO_PAUSA_MS: '0', CONCILIACAO_ATRASO_S: '120', CONCILIACAO_SOBREPOSICAO_S: '600',
      CONCILIACAO_JANELA_MAX_H: '0.25', CONCILIACAO_INICIO_H: '1', CONCILIACAO_MAX_PENDENTES: '100000',
    });
  });

  afterAll(async () => {
    process.env = env;
    await pool.end();
  });

  beforeEach(async () => {
    deviceId = 600_000 + Math.floor(Math.random() * 100_000);
    traccar = new TraccarFalso(deviceId);
    traccar.lastUpdate = agora.toISOString();
    service = new ConciliacaoService(repo, traccar as unknown as TraccarClient);
    rastreadorId = (
      await pool.query<{ id: string }>('insert into rastreadores (imei, traccar_device_id) values ($1, $2) returning id', [
        randomUUID().replace(/-/g, '').slice(0, 15),
        deviceId,
      ])
    ).rows[0].id;
  });

  // Um worker do inbox de fora (a API local) pode estar no meio da transação de uma linha deste device: fecha as linhas
  // para ninguém mais reivindicar e repete a limpeza enquanto a transação dele ainda grava (FK de rastreadores).
  afterEach(async () => {
    await pool.query(`update ingest_inbox set processado_em = now() where processado_em is null and (payload->'position'->>'deviceId')::bigint = $1`, [deviceId]);
    for (let tentativa = 1; ; tentativa++) {
      try {
        await pool.query(`delete from ingest_inbox where (payload->'position'->>'deviceId')::bigint = $1`, [deviceId]);
        for (const t of ['ingest_conciliacao_checkpoints', 'rastreador_comunicacao', 'ultima_posicao', 'eventos', 'posicoes', 'ingest_posicoes_recebidas']) {
          await pool.query(`delete from ${t} where rastreador_id = $1`, [rastreadorId]);
        }
        await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
        return;
      } catch (err) {
        if (tentativa >= 20 || (err as { code?: string }).code !== '23503') throw err;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  });

  it('recupera só o que falta (nem gravado nem no inbox), com prioridade 1, e avança o checkpoint até agora − atraso', async () => {
    // 51 posições, uma por minuto, de 55 a 5 minutos atrás
    traccar.posicoes = Array.from({ length: 51 }, (_, i) => posicao(1000 + i, fix(55 - i)));
    // 10 já gravadas pela ingestão, 5 esperando no inbox (vieram pelo Forwarding)
    for (const p of traccar.posicoes.slice(0, 10)) {
      await pool.query('insert into ingest_posicoes_recebidas (rastreador_id, traccar_position_id) values ($1, $2)', [rastreadorId, p.id]);
    }
    const inbox = new InboxRepository(pool);
    for (const p of traccar.posicoes.slice(10, 15)) await inbox.inserir('posicao', { position: p });

    const r = await service.conciliar(agora, { rastreadorId });

    expect(r).toMatchObject({ rastreadores: 1, verificadas: 51, recuperadas: 36, rejeitadas: 0, falhas: 0, interrompidaPor: null });
    expect(r!.jaRecebidas + r!.jaNoInbox).toBe(15);
    const linhas = await linhasDoDevice();
    expect(linhas).toHaveLength(41); // 5 do Forwarding + 36 recuperadas
    expect(new Set(linhas.map((l) => l.id)).size).toBe(41); // nenhum id duas vezes
    expect(linhas.filter((l) => l.origem === 'conciliacao').every((l) => l.prioridade === 1)).toBe(true);
    expect((await checkpoint())?.getTime()).toBe(agora.getTime() - 120_000);
    // 58 min de janela em fatias de 15 min
    expect(traccar.consultas).toHaveLength(4);
  });

  it('reexecutar a volta não duplica: a segunda não recupera nada', async () => {
    traccar.posicoes = Array.from({ length: 20 }, (_, i) => posicao(2000 + i, fix(30 - i)));
    const primeira = await service.conciliar(agora, { rastreadorId });
    expect(primeira?.recuperadas).toBe(20);

    // checkpoint já em agora − 2 min: a segunda volta (mais tarde) só confere a sobreposição
    const segunda = await service.conciliar(new Date(agora.getTime() + 60_000), { rastreadorId });
    expect(segunda?.recuperadas).toBe(0);
    const reexecucao = await service.reexecutar({ rastreadorId }, min(60), agora);
    expect(reexecucao.recuperadas).toBe(0);
    expect(reexecucao.jaRecebidas + reexecucao.jaNoInbox).toBe(20);
    expect(await linhasDoDevice()).toHaveLength(20);
  });

  it('falha no meio: as janelas já gravadas ficam, a que falhou não avança, e a volta seguinte retoma de onde parou', async () => {
    traccar.posicoes = Array.from({ length: 51 }, (_, i) => posicao(3000 + i, fix(55 - i)));
    traccar.falharNaConsulta = 3; // 3ª janela de 15 min
    const r = await service.conciliar(agora, { rastreadorId });
    expect(r?.falhas).toBe(1);
    // duas janelas commitadas: checkpoint em início + 30 min (não no fim)
    const parcial = await checkpoint();
    expect(parcial?.getTime()).toBe(agora.getTime() - 60 * 60_000 + 30 * 60_000);
    const recuperadasAntes = (await linhasDoDevice()).length;
    // posições com fixTime até o checkpoint estão no inbox; nenhuma depois dele
    expect(recuperadasAntes).toBe(traccar.posicoes.filter((p) => Date.parse(p.fixTime) <= parcial!.getTime()).length);

    traccar.falharNaConsulta = null;
    const retomada = await service.conciliar(agora, { rastreadorId });
    expect(retomada?.falhas).toBe(0);
    // retomou do checkpoint (menos a sobreposição), não do começo
    expect(traccar.consultas[3].from.getTime()).toBe(parcial!.getTime() - 600_000);
    const linhas = await linhasDoDevice();
    expect(linhas).toHaveLength(51);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(51);
  });

  it('aparelho sem pacote desde antes da janela: avança o checkpoint sem consultar o Traccar', async () => {
    traccar.lastUpdate = min(240).toISOString();
    traccar.posicoes = [posicao(4000, fix(30))]; // não deveria ser buscada
    const r = await service.conciliar(agora, { rastreadorId });
    expect(traccar.consultas).toHaveLength(0);
    expect(r?.recuperadas).toBe(0);
    expect((await checkpoint())?.getTime()).toBe(agora.getTime() - 120_000);
  });

  it('posição que o validador do Forwarding recusa é contada e não entra no inbox', async () => {
    traccar.posicoes = [posicao(5000, fix(30)), posicao(5001, fix(29), { latitude: 123 })];
    const r = await service.conciliar(agora, { rastreadorId });
    expect(r).toMatchObject({ verificadas: 2, recuperadas: 1, rejeitadas: 1 });
    expect((await linhasDoDevice()).map((l) => l.id)).toEqual(['5000']);
  });

  it('freio: com recuperadas demais pendentes, a volta para sem consultar nem avançar checkpoint', async () => {
    process.env.CONCILIACAO_MAX_PENDENTES = '0';
    try {
      traccar.posicoes = [posicao(6000, fix(30))];
      const r = await service.conciliar(agora, { rastreadorId });
      expect(r?.interrompidaPor).toBe('freio');
      expect(traccar.consultas).toHaveLength(0);
      expect(await checkpoint()).toBeNull();
    } finally {
      process.env.CONCILIACAO_MAX_PENDENTES = '100000';
    }
  });

  it('checkpoint mudado por outra instância no meio: nada é gravado daquela janela', async () => {
    traccar.posicoes = [posicao(7000, fix(30))];
    const res = await repo.gravarJanela({ rastreadorId, traccarDeviceId: deviceId }, traccar.posicoes, { esperado: min(999), novo: agora });
    // não existia checkpoint: o insert entra (esperado só vale contra uma linha existente)
    expect(res.conflito).toBe(false);
    const conflito = await repo.gravarJanela({ rastreadorId, traccarDeviceId: deviceId }, [posicao(7001, fix(20))], { esperado: min(999), novo: agora });
    expect(conflito.conflito).toBe(true);
    expect((await linhasDoDevice()).map((l) => l.id)).toEqual(['7000']);
  });

  it('reexecução manual confere o período pedido e não mexe no checkpoint', async () => {
    traccar.posicoes = [posicao(8000, fix(300)), posicao(8001, fix(200))];
    const r = await service.reexecutar({ traccarDeviceId: deviceId }, min(360), min(100));
    expect(r.recuperadas).toBe(2);
    expect(await checkpoint()).toBeNull();
    const execucao = await pool.query('select modo, recuperadas from ingest_conciliacao_execucoes where id = $1', [r.execucaoId]);
    expect(execucao.rows[0]).toEqual({ modo: 'manual', recuperadas: 2 });
  });

  it('nunca confere antes do prazo do controle de duplicidade (posição velha seria gravada duas vezes)', async () => {
    // manual: recusa
    await expect(service.reexecutar({ rastreadorId }, min(20 * 24 * 60), min(19 * 24 * 60))).rejects.toThrow('controle de duplicidade');
    // automática com checkpoint de 30 dias atrás (API fora por semanas): começa no limite (14 − 1 dias), não no checkpoint
    await pool.query('insert into ingest_conciliacao_checkpoints (rastreador_id, conciliado_ate) values ($1, $2)', [rastreadorId, min(30 * 24 * 60)]);
    process.env.CONCILIACAO_JANELA_MAX_H = '1000';
    try {
      await service.conciliar(agora, { rastreadorId });
    } finally {
      process.env.CONCILIACAO_JANELA_MAX_H = '0.25';
    }
    expect(traccar.consultas[0].from.getTime()).toBe(agora.getTime() - 13 * 86_400_000);
  });
});
