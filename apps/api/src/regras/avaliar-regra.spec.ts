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
