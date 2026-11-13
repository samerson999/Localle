import { describe, expect, it } from 'vitest';
import { condicaoAtende, regraAtende, type ContextoRegra } from './avaliar-regra';

// 2026-03-04 (quarta) 01:30Z = 22:30 de terça em Recife (UTC-3)
const ctx = (o: Partial<ContextoRegra> = {}): ContextoRegra => ({
  fixTime: new Date('2026-03-04T01:30:00Z'),
  speedKmh: 50,
  ignition: true,
  tiposCercaDentro: ['Cliente'],
  alarms: [],
  attributes: {},
  ...o,
});

describe('condicaoAtende', () => {
  it('velocidade e ignição', () => {
    expect(condicaoAtende({ field: 'velocidade', op: '>', value: '40' }, ctx())).toBe(true);
    expect(condicaoAtende({ field: 'velocidade', op: '<', value: '40' }, ctx())).toBe(false);
    expect(condicaoAtende({ field: 'velocidade', op: '>', value: '40' }, ctx({ speedKmh: null }))).toBe(false);
    expect(condicaoAtende({ field: 'ignicao', op: '=', value: 'Ligada' }, ctx())).toBe(true);
    expect(condicaoAtende({ field: 'ignicao', op: '=', value: 'Desligada' }, ctx({ ignition: null }))).toBe(false);
  });

  it('estado lido do rastreador: tensão, satélites, sinal e bloqueio pela leitura do modelo; sem leitura é falso', () => {
    const telemetria = { tensaoV: 11.2, satelites: 3, sinalGsm: 1, bloqueado: true };
    expect(condicaoAtende({ field: 'tensao', op: '<', value: '11.5' }, ctx({ telemetria }))).toBe(true);
    expect(condicaoAtende({ field: 'tensao', op: '<', value: '11.5' }, ctx())).toBe(false);
    expect(condicaoAtende({ field: 'satelites', op: '<', value: '4' }, ctx({ telemetria }))).toBe(true);
    expect(condicaoAtende({ field: 'sinal_gsm', op: '>', value: '2' }, ctx({ telemetria }))).toBe(false);
    // leitura do modelo vale sobre o `blocked` cru
    expect(condicaoAtende({ field: 'bloqueio', op: '=', value: 'Ativo' }, ctx({ telemetria, attributes: { blocked: false } }))).toBe(true);
  });

  it('atributo cru do Traccar: número, booleano e texto; ausente nunca atende (nem no ≠)', () => {
    const a = { in1: true, io239: 1, fuel: '42.5', modo: 'eco' };
    expect(condicaoAtende({ field: 'atributo', attr: 'in1', op: '=', value: 'true' }, ctx({ attributes: a }))).toBe(true);
    expect(condicaoAtende({ field: 'atributo', attr: 'io239', op: '=', value: '1' }, ctx({ attributes: a }))).toBe(true);
    expect(condicaoAtende({ field: 'atributo', attr: 'fuel', op: '<', value: '50' }, ctx({ attributes: a }))).toBe(true);
    expect(condicaoAtende({ field: 'atributo', attr: 'modo', op: '≠', value: 'eco' }, ctx({ attributes: a }))).toBe(false);
    expect(condicaoAtende({ field: 'atributo', attr: 'modo', op: '>', value: '1' }, ctx({ attributes: a }))).toBe(false);
    expect(condicaoAtende({ field: 'atributo', attr: 'in2', op: '≠', value: 'true' }, ctx({ attributes: a }))).toBe(false);
    expect(condicaoAtende({ field: 'atributo', attr: 'constructor', op: '=', value: 'x' }, ctx({ attributes: a }))).toBe(false);
  });

  it('horário e dia no fuso da operação (não em UTC)', () => {
    expect(condicaoAtende({ field: 'horario', op: 'depois de', value: '22:00' }, ctx())).toBe(true);
    expect(condicaoAtende({ field: 'horario', op: 'antes de', value: '22:00' }, ctx())).toBe(false);
    expect(condicaoAtende({ field: 'dia_semana', op: '=', value: 'Dia útil' }, ctx())).toBe(true); // terça local
    // sábado 01:00Z = sexta 22:00 em Recife: ainda dia útil
    expect(condicaoAtende({ field: 'dia_semana', op: '=', value: 'Dia útil' }, ctx({ fixTime: new Date('2026-03-07T01:00:00Z') }))).toBe(true);
    expect(condicaoAtende({ field: 'dia_semana', op: '=', value: 'Fim de semana' }, ctx({ fixTime: new Date('2026-03-07T15:00:00Z') }))).toBe(true);
  });

  it('cercas por tipo', () => {
    expect(condicaoAtende({ field: 'dentro_cerca', op: '=', value: 'Cliente' }, ctx())).toBe(true);
    expect(condicaoAtende({ field: 'fora_cerca', op: '=', value: 'Cliente' }, ctx())).toBe(false);
    expect(condicaoAtende({ field: 'fora_cerca', op: '=', value: 'Matriz' }, ctx())).toBe(true);
  });

  it('sensores dos attributes do Traccar; ausentes = condição falsa', () => {
    expect(condicaoAtende({ field: 'bateria', op: '<', value: '11.5' }, ctx({ attributes: { power: 10.2 } }))).toBe(true);
    expect(condicaoAtende({ field: 'bateria', op: '<', value: '11.5' }, ctx())).toBe(false);
    expect(condicaoAtende({ field: 'temperatura', op: '>', value: '-12' }, ctx({ attributes: { temp1: -8 } }))).toBe(true);
    expect(condicaoAtende({ field: 'porta', op: '=', value: 'Aberta' }, ctx({ attributes: { door: true } }))).toBe(true);
    expect(condicaoAtende({ field: 'porta', op: '=', value: 'Fechada' }, ctx())).toBe(false);
    expect(condicaoAtende({ field: 'bloqueio', op: '=', value: 'Ativo' }, ctx({ attributes: { blocked: true } }))).toBe(true);
  });

  it('pânico e alimentação pelos alarmes da posição', () => {
    expect(condicaoAtende({ field: 'panico', op: '=', value: 'Acionado' }, ctx({ alarms: ['sos'] }))).toBe(true);
    expect(condicaoAtende({ field: 'panico', op: '=', value: 'Acionado' }, ctx())).toBe(false);
    expect(condicaoAtende({ field: 'alimentacao', op: '=', value: 'Desconectada' }, ctx({ alarms: ['powerCut'] }))).toBe(true);
    expect(condicaoAtende({ field: 'alimentacao', op: '=', value: 'Conectada' }, ctx())).toBe(true);
  });

  it('alimentação pelo estado lido quando o aparelho não manda o alarme', () => {
    const desconectada = { field: 'alimentacao' as const, op: '=', value: 'Desconectada' };
    const conectada = { field: 'alimentacao' as const, op: '=', value: 'Conectada' };
    expect(condicaoAtende(desconectada, ctx({ alimentacaoExterna: false }))).toBe(true);
    expect(condicaoAtende(conectada, ctx({ alimentacaoExterna: false }))).toBe(false);
    expect(condicaoAtende(desconectada, ctx({ alimentacaoExterna: true }))).toBe(false);
    expect(condicaoAtende(conectada, ctx({ alimentacaoExterna: true }))).toBe(true);
    // o alarme vale mesmo com a leitura dizendo ligada (pacote do alarme pode chegar antes da tensão cair)
    expect(condicaoAtende(desconectada, ctx({ alarms: ['powerCut'], alimentacaoExterna: true }))).toBe(true);
  });
});

describe('regraAtende', () => {
  it('exige todas as condições; regra vazia nunca dispara', () => {
    const r1 = [
      { field: 'ignicao' as const, op: '=', value: 'Ligada' },
      { field: 'horario' as const, op: 'depois de', value: '22:00' },
    ];
    expect(regraAtende(r1, ctx())).toBe(true);
    expect(regraAtende([...r1, { field: 'velocidade', op: '>', value: '90' }], ctx())).toBe(false);
    expect(regraAtende([], ctx())).toBe(false);
  });
});
