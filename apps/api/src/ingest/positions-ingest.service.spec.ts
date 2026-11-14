import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
      alarms: [],
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

  // 12/11/2026, HML: o VL100 manda um pacote de status a cada ~10 s e o Traccar repete nele a última posição (mesma hora e
  // lugar) — até 10 mil linhas iguais por dia, e o histórico do dia (limite de 10 mil pontos) perdia o fim do percurso.
  it('pacote de status que repete a última posição não vira linha nova, mas os atributos dele valem', async () => {
    const rastreadorId = await criarRastreador(1012);
    const original = await service.ingest(position({ traccarDeviceId: 1012, traccarPositionId: 1, attributes: { ignition: true, sat: 15 } }));
    expect(original.status === 'gravada' && original.posicaoCopiada).toBe(false);

    // mesma hora e mesmo lugar, chegando depois, com ignição desligada e sinal: com e sem GPS válido no pacote
    const status = await service.ingest(position({
      traccarDeviceId: 1012, traccarPositionId: 2, serverTime: new Date('2026-01-01T12:00:30Z'), speedKmh: 0, ignition: false,
      attributes: { ignition: false, rssi: 3 },
    }));
    const semFix = await service.ingest(position({
      traccarDeviceId: 1012, traccarPositionId: 3, serverTime: new Date('2026-01-01T12:00:40Z'), valid: false, attributes: { rssi: 2 },
    }));
    expect(status.status === 'gravada' && status.posicaoCopiada).toBe(true);
    expect(semFix.status === 'gravada' && semFix.posicaoCopiada).toBe(true);
    const posicaoOriginal = original.status === 'gravada' ? original.posicaoId : '';
    expect(status.status === 'gravada' && status.posicaoId).toBe(posicaoOriginal);

    const { rows: n } = await pool.query('select count(*)::int as n from posicoes where rastreador_id = $1', [rastreadorId]);
    expect(n[0].n).toBe(1);
    // a reserva da cópia fica resolvida com a posição original (evento do Traccar com esse id acha a posição)
    const { rows: reservas } = await pool.query('select traccar_position_id, posicao_id from ingest_posicoes_recebidas where rastreador_id = $1 order by 1', [rastreadorId]);
    expect(reservas.map((r) => r.posicao_id)).toEqual([posicaoOriginal, posicaoOriginal, posicaoOriginal]);
    // comunicação e atributos seguem o pacote mais novo
    const { rows: com } = await pool.query('select ultimo_pacote_em, ultimos_atributos from rastreador_comunicacao where rastreador_id = $1', [rastreadorId]);
    expect(com[0].ultimo_pacote_em.toISOString()).toBe('2026-01-01T12:00:40.000Z');
    expect(com[0].ultimos_atributos).toMatchObject({ ignition: false, rssi: 2, sat: 15 });
  });

  // 13/11/2026: o alarme de um pacote de status levava a hora da posição repetida (horas ou dias antes)
  it('alarme no pacote de status leva a hora em que chegou; na posição nova, a do GPS', async () => {
    const rastreadorId = await criarRastreador(1014);
    await service.ingest(position({ traccarDeviceId: 1014, traccarPositionId: 1, alarms: ['vibration'] }));
    const chegou = new Date('2026-01-01T15:30:00Z'); // 3 h e meia depois da posição repetida
    const status = await service.ingest(position({ traccarDeviceId: 1014, traccarPositionId: 2, serverTime: chegou, alarms: ['lowBattery'] }));
    expect(status.status === 'gravada' && status.eventos.map((e) => [e.tipo, e.ts.toISOString()])).toEqual([['lowBattery', chegou.toISOString()]]);

    const { rows } = await pool.query(
      `select tipo, ts, attributes->>'posicaoEm' as posicao_em from eventos where rastreador_id = $1 order by ts`, [rastreadorId],
    );
    expect(rows.map((r) => [r.tipo, r.ts.toISOString(), r.posicao_em])).toEqual([
      ['vibration', '2026-01-01T12:00:00.000Z', null],
      ['lowBattery', chegou.toISOString(), '2026-01-01T12:00:00.000Z'],
    ]);
  });

  it('posição nova (outra hora ou outro lugar) continua sendo gravada', async () => {
    const rastreadorId = await criarRastreador(1013);
    await service.ingest(position({ traccarDeviceId: 1013, traccarPositionId: 1 }));
    const outraHora = await service.ingest(position({ traccarDeviceId: 1013, traccarPositionId: 2, fixTime: new Date('2026-01-01T12:00:10Z') }));
    // mesma hora, outro lugar: não é cópia (aparelho que manda dois pontos no mesmo segundo)
    const outroLugar = await service.ingest(position({ traccarDeviceId: 1013, traccarPositionId: 3, fixTime: new Date('2026-01-01T12:00:10Z'), longitude: -34.87 }));
    expect(outraHora.status === 'gravada' && outraHora.posicaoCopiada).toBe(false);
    expect(outroLugar.status === 'gravada' && outroLugar.posicaoCopiada).toBe(false);
    const { rows } = await pool.query('select count(*)::int as n from posicoes where rastreador_id = $1', [rastreadorId]);
    expect(rows[0].n).toBe(3);
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

  it('alarme do aparelho vira evento resolvido para o cliente, e o reenvio da posição não duplica o evento', async () => {
    const rastreadorId = await criarRastreador(1007);
    await instalar(rastreadorId, '2026-01-01T00:00:00Z');
    const p = position({ traccarDeviceId: 1007, traccarPositionId: 7, alarms: ['sos', 'powerCut'] });

    const result = await service.ingest(p);
    expect(result.status).toBe('gravada');
    if (result.status !== 'gravada') return;
    expect(result.eventos.map((e) => e.tipo).sort()).toEqual(['powerCut', 'sos']);

    await service.ingest(p);
    const { rows } = await pool.query(
      'select tipo, origem, client_id, asset_id from eventos where rastreador_id = $1 order by tipo',
      [rastreadorId],
    );
    expect(rows).toEqual([
      { tipo: 'powerCut', origem: 'aparelho', client_id: clientId, asset_id: assetId },
      { tipo: 'sos', origem: 'aparelho', client_id: clientId, asset_id: assetId },
    ]);
  });

  it('alimentação ligada → cortada sem alarme do aparelho vira evento powerCut com alerta; já cortada não repete', async () => {
    const rastreadorId = await criarRastreador(1011);
    await instalar(rastreadorId, '2026-01-01T00:00:00Z');
    const t = (s: string) => new Date(`2026-01-01T12:${s}Z`);
    const pacote = (id: number, s: string, attributes: Record<string, unknown>, alarms: string[] = []) =>
      service.ingest(position({ traccarDeviceId: 1011, traccarPositionId: id, fixTime: t(s), serverTime: t(s), attributes, alarms }));

    await pacote(1, '00:00', { power: 12.8 });
    const corte = await pacote(2, '00:10', { power: 0.7 });
    expect(corte.status === 'gravada' && corte.eventos.map((e) => e.tipo)).toEqual(['powerCut']);
    expect(corte.status === 'gravada' && corte.alertas.map((a) => [a.tipo, a.titulo, a.prioridade])).toEqual([['powerCut', 'Alimentação do rastreador cortada', 'alta']]);

    // continua cortada: não é virada nova
    const depois = await pacote(3, '00:20', { power: 0.6 });
    expect(depois.status === 'gravada' && depois.eventos).toEqual([]);

    // religou e cortou de novo, desta vez com o alarme do aparelho: um evento só, o do alarme
    await pacote(4, '00:30', { power: 12.7 });
    const comAlarme = await pacote(5, '00:40', { power: 0.5 }, ['powerCut']);
    expect(comAlarme.status === 'gravada' && comAlarme.eventos.map((e) => e.tipo)).toEqual(['powerCut']);

    const { rows } = await pool.query("select attributes->>'detectadoPor' as por from eventos where rastreador_id = $1 and tipo = 'powerCut' order by ts", [rastreadorId]);
    expect(rows).toEqual([{ por: 'tensao' }, { por: null }]);
  });

  it('corte pelo `charge` (aparelho sem tensão) e aparelho que já chega cortado não gera alerta', async () => {
    const gt06 = await criarRastreador(1012);
    await instalar(gt06, '2026-01-01T00:00:00Z');
    await service.ingest(position({ traccarDeviceId: 1012, traccarPositionId: 1, attributes: { charge: true } }));
    const corte = await service.ingest(position({ traccarDeviceId: 1012, traccarPositionId: 2, fixTime: new Date('2026-01-01T12:05:00Z'), serverTime: new Date('2026-01-01T12:05:01Z'), attributes: { charge: false } }));
    expect(corte.status === 'gravada' && corte.alertas.map((a) => a.tipo)).toEqual(['powerCut']);

    // bancada: primeiro pacote já sem alimentação
    await criarRastreador(1013);
    const bancada = await service.ingest(position({ traccarDeviceId: 1013, traccarPositionId: 1, attributes: { power: 0.7 } }));
    expect(bancada.status === 'gravada' && bancada.eventos).toEqual([]);
  });

  it('pacote válido atrasado não regride ultima_posicao_valida_em', async () => {
    const rastreadorId = await criarRastreador(1008);
    await service.ingest(position({ traccarDeviceId: 1008, traccarPositionId: 1, fixTime: new Date('2026-01-02T12:00:00Z') }));
    await service.ingest(position({ traccarDeviceId: 1008, traccarPositionId: 2, fixTime: new Date('2026-01-01T12:00:00Z') }));
    const { rows } = await pool.query(
      'select ultima_posicao_valida_em from rastreador_comunicacao where rastreador_id = $1',
      [rastreadorId],
    );
    expect(rows[0].ultima_posicao_valida_em.toISOString()).toBe('2026-01-02T12:00:00.000Z');
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

  it('posição atrasada (ex.: recuperada pela conciliação) não volta ultimo_pacote_em nem troca o vínculo da comunicação', async () => {
    const rastreadorId = await criarRastreador(1020);
    await instalar(rastreadorId, '2026-01-01T00:00:00Z');
    await service.ingest(
      position({ traccarDeviceId: 1020, traccarPositionId: 2, fixTime: new Date('2026-01-02T12:00:00Z'), serverTime: new Date('2026-01-02T12:00:01Z') }),
    );
    // de antes da instalação: o dono no instante do dado é "ninguém" — gravada no histórico, mas não é o estado atual
    const atrasada = await service.ingest(
      position({ traccarDeviceId: 1020, traccarPositionId: 1, fixTime: new Date('2025-12-31T10:00:00Z'), serverTime: new Date('2025-12-31T10:00:01Z') }),
    );
    expect(atrasada.status).toBe('gravada');

    const { rows } = await pool.query('select ultimo_pacote_em, asset_id, client_id from rastreador_comunicacao where rastreador_id = $1', [rastreadorId]);
    expect(rows[0].ultimo_pacote_em.toISOString()).toBe('2026-01-02T12:00:01.000Z');
    expect(rows[0].asset_id).toBe(assetId);
    expect(rows[0].client_id).toBe(clientId);
    const ultima = await pool.query('select fix_time from ultima_posicao where rastreador_id = $1', [rastreadorId]);
    expect(ultima.rows[0].fix_time.toISOString()).toBe('2026-01-02T12:00:00.000Z');
  });

  it('hora não confiável (relógio adiantado): vai para o histórico, mas não congela o mapa nem a comunicação', async () => {
    const rastreadorId = await criarRastreador(1021);
    await instalar(rastreadorId, '2026-01-01T00:00:00Z');
    await service.ingest(position({ traccarDeviceId: 1021, traccarPositionId: 1, fixTime: new Date('2026-01-02T12:00:00Z'), serverTime: new Date('2026-01-02T12:00:01Z') }));
    // aparelho com o relógio em 2027
    const adiantada = await service.ingest(
      position({ traccarDeviceId: 1021, traccarPositionId: 2, fixTime: new Date('2027-06-01T00:00:00Z'), serverTime: new Date('2026-01-02T12:01:00Z'), horaConfiavel: false }),
    );
    expect(adiantada.status === 'gravada' && adiantada.atualizouUltimaPosicao).toBe(false);
    // a seguinte, com relógio certo, move o mapa normalmente (antes, a de 2027 travava ultima_posicao até 2027)
    const seguinte = await service.ingest(position({ traccarDeviceId: 1021, traccarPositionId: 3, fixTime: new Date('2026-01-02T12:02:00Z'), serverTime: new Date('2026-01-02T12:02:01Z') }));
    expect(seguinte.status === 'gravada' && seguinte.atualizouUltimaPosicao).toBe(true);

    const historico = await pool.query('select fix_time, valid from posicoes where rastreador_id = $1 and traccar_position_id = 2', [rastreadorId]);
    expect(historico.rows[0]).toEqual({ fix_time: new Date('2027-06-01T00:00:00Z'), valid: true }); // dado original preservado
    const com = await pool.query('select ultima_posicao_valida_em, ultimo_pacote_em from rastreador_comunicacao where rastreador_id = $1', [rastreadorId]);
    expect(com.rows[0].ultima_posicao_valida_em.toISOString()).toBe('2026-01-02T12:02:00.000Z');
    expect(com.rows[0].ultimo_pacote_em.toISOString()).toBe('2026-01-02T12:02:01.000Z');
  });

  it('telemetria usa o último valor conhecido de cada atributo; pacote atrasado só preenche o que faltava', async () => {
    const rastreadorId = await criarRastreador(1010);
    const t = (s: string) => new Date(`2026-01-01T12:${s}Z`);
    // como o GT06: heartbeat com sinal/bloqueio, depois localização só com satélites, depois a tensão
    await service.ingest(position({ traccarDeviceId: 1010, traccarPositionId: 1, serverTime: t('00:00'), attributes: { rssi: 4, blocked: false } }));
    await service.ingest(position({ traccarDeviceId: 1010, traccarPositionId: 2, serverTime: t('00:15'), attributes: { sat: 15 } }));
    const r = await service.ingest(position({ traccarDeviceId: 1010, traccarPositionId: 3, serverTime: t('00:30'), attributes: { power: 13.3, rssi: 2 } }));
    // cada leitura com a data da sua chave: o bloqueio é o do heartbeat das 12:00
    expect(r.status === 'gravada' && r.telemetria).toEqual({
      tensaoV: 13.3, satelites: 15, sinalGsm: 2, bloqueado: false, alimentacaoExterna: true, odometroPainelKm: null, velocidadePainelKmh: null, ignicao: null,
      lidaEm: { tensaoV: t('00:30').toISOString(), satelites: t('00:15').toISOString(), sinalGsm: t('00:30').toISOString(), bloqueado: t('00:00').toISOString(), alimentacaoExterna: t('00:30').toISOString(), odometroPainel: null, velocidadePainel: null, ignicao: null },
    });

    // reenvio atrasado (serverTime antigo) não volta o sinal para 4, mas traz a chave nova
    const atrasada = await service.ingest(position({ traccarDeviceId: 1010, traccarPositionId: 4, serverTime: t('00:05'), attributes: { rssi: 4, hdop: 0.7 } }));
    expect(atrasada.status === 'gravada' && atrasada.telemetria.sinalGsm).toBe(2);
    const { rows } = await pool.query('select ultimos_atributos, atributos_em, atributos_vistos_em from rastreador_comunicacao where rastreador_id = $1', [rastreadorId]);
    expect(rows[0].ultimos_atributos).toEqual({ rssi: 2, blocked: false, sat: 15, power: 13.3, hdop: 0.7 });
    expect(rows[0].atributos_em.toISOString()).toBe('2026-01-01T12:00:30.000Z');
    // o atrasado não envelhece o rssi das 12:00:30, mas registra a chave que só ele trouxe
    expect(rows[0].atributos_vistos_em).toEqual({
      rssi: t('00:30').toISOString(), blocked: t('00:00').toISOString(), sat: t('00:15').toISOString(), power: t('00:30').toISOString(), hdop: t('00:05').toISOString(),
    });
  });

  it('telemetria segue o mapeamento do modelo do rastreador (chave de tensão e escala do sinal)', async () => {
    const rastreadorId = await criarRastreador(1011);
    const modelo = await pool.query<{ id: string }>(
      `insert into rastreador_modelos (fabricante, nome, protocolo, porta, tipo_identificador, atributo_tensao, sinal_max)
       values ($1, 'X', 'jmak', 5259, 'imei', 'vin', 31) returning id`,
      [`teste-${randomUUID()}`],
    );
    try {
      await pool.query('update rastreadores set modelo_id = $2 where id = $1', [rastreadorId, modelo.rows[0].id]);
      const r = await service.ingest(position({ traccarDeviceId: 1011, traccarPositionId: 1, attributes: { vin: 12507, rssi: 21, out1: false } }));
      expect(r.status === 'gravada' && r.telemetria).toMatchObject({ tensaoV: 12.51, satelites: null, sinalGsm: 3, bloqueado: null });
    } finally {
      await pool.query('update rastreadores set modelo_id = null where id = $1', [rastreadorId]);
      await pool.query('delete from rastreador_modelos where id = $1', [modelo.rows[0].id]);
    }
  });

  it('loga atributo novo e atributo lido que parou de chegar (mudança de decoder que passaria despercebida)', async () => {
    await criarRastreador(1012);
    const log = vi.spyOn(Logger.prototype, 'log');
    const warn = vi.spyOn(Logger.prototype, 'warn');
    try {
      const em = (min: number) => new Date(Date.UTC(2026, 0, 1, 12, min));
      await service.ingest(position({ traccarDeviceId: 1012, traccarPositionId: 1, serverTime: em(0), attributes: { power: 12.5, rssi: 3 } }));
      // o decoder passou a mandar a tensão em outra chave
      for (let i = 1; i <= 61; i++) {
        await service.ingest(position({ traccarDeviceId: 1012, traccarPositionId: 1 + i, serverTime: em(i), attributes: { vin: 12500, rssi: 3 } }));
      }
      const mensagens = (spy: typeof log) => spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('atributo'));
      expect(mensagens(log)).toEqual([expect.stringMatching(/atributos novos: vin/)]);
      expect(mensagens(warn)).toEqual([expect.stringMatching(/atributo power, lido pela plataforma como tensão, não chega desde 2026-01-01T12:01:00.000Z/)]);
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  }, 15_000); // ~4 s numa máquina livre; com a suíte inteira em paralelo passava dos 5 s padrão e a limpeza quebrava em cascata

  it('grava o protocolo informado pelo Traccar no rastreador, e atualiza se mudar', async () => {
    const rastreadorId = await criarRastreador(1099);
    const protocolo = async () => (await pool.query('select protocolo from rastreadores where id = $1', [rastreadorId])).rows[0].protocolo;

    await service.ingest(position({ traccarDeviceId: 1099, traccarPositionId: 1 }));
    expect(await protocolo()).toBeNull(); // sem protocolo na posição, não mexe
    await service.ingest(position({ traccarDeviceId: 1099, traccarPositionId: 2, protocol: 'gt06' }));
    expect(await protocolo()).toBe('gt06');
    await service.ingest(position({ traccarDeviceId: 1099, traccarPositionId: 3, protocol: 'suntech' }));
    expect(await protocolo()).toBe('suntech');
  });

  // 14/11/2026: rastreador backup/tag comunica com o cliente, mas não fala pelo ativo
  it('backup: grava com o cliente, sem ativo no histórico, e não vira a posição do ativo', async () => {
    const principal = await criarRastreador(1031);
    const backup = await criarRastreador(1032);
    await instalar(principal, '2026-01-01T00:00:00Z');
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, papel, instalado_em, tecnico)
       values ($1, $2, $3, 'backup', '2026-01-01T00:00:00Z', 'teste')`,
      [clientId, backup, assetId],
    );

    await service.ingest(position({ traccarDeviceId: 1031, traccarPositionId: 1, fixTime: new Date('2026-01-01T12:00:00Z') }));
    const r = await service.ingest(
      position({ traccarDeviceId: 1032, traccarPositionId: 1, fixTime: new Date('2026-01-01T13:00:00Z'), longitude: -35, latitude: -9, alarms: ['powerCut'] }),
    );
    expect(r).toMatchObject({ status: 'gravada', clientId, assetId: null, atualizouUltimaPosicao: false });
    // alarme do backup vira alerta do gestor, preso ao ativo, mas o evento fica fora da linha do tempo do ativo
    if (r.status !== 'gravada') throw new Error('esperava gravada');
    expect(r.eventos.map((e) => e.tipo)).toEqual(['powerCut']);
    expect(r.alertas).toHaveLength(1);
    expect(r.alertas[0].titulo).toMatch(/^Backup: /);
    const al = await pool.query('select asset_id from alertas where id = $1', [r.alertas[0].id]);
    expect(al.rows[0].asset_id).toBe(assetId);
    const ev = await pool.query('select asset_id from eventos where rastreador_id = $1', [backup]);
    expect(ev.rows).toEqual([{ asset_id: null }]);

    const pos = await pool.query('select client_id, asset_id from posicoes where rastreador_id = $1', [backup]);
    expect(pos.rows[0]).toEqual({ client_id: clientId, asset_id: null });
    // a ficha acha a última posição e a comunicação do backup pelo rastreador
    const up = await pool.query('select asset_id, st_x(geom) as lon from ultima_posicao where rastreador_id = $1', [backup]);
    expect(up.rows[0]).toEqual({ asset_id: assetId, lon: -35 });
    const rc = await pool.query('select client_id, asset_id from rastreador_comunicacao where rastreador_id = $1', [backup]);
    expect(rc.rows[0]).toEqual({ client_id: clientId, asset_id: assetId });
    // o mapa continua com o principal, mesmo com a posição do backup mais nova
    const v = await pool.query('select rastreador_id from v_localizacao_atual where asset_id = $1', [assetId]);
    expect(v.rows).toEqual([{ rastreador_id: principal }]);
  });
});
