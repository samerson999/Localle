import type { Point } from '@localle/shared/points';
import { describe, expect, it } from 'vitest';
import { diaNoFuso, resumirDia, turnoDaJanela } from './jornada-motorista';

const M = 60_000;
const T0 = Date.parse('2026-09-01T11:00:00Z'); // 08:00 em Recife
// [minuto, longitude, km/h, ignição]
const pts = (xs: [number, number, number, number | null][]): Point[] => xs.map(([m, lon, v, ign]) => [T0 + m * M, -8.05, lon, v, ign]);

describe('turno do motorista (vínculo do cartão × posições)', () => {
  // desligado, liga 08:02, cartão lido 08:03, anda, desliga 08:30
  const p = pts([[0, -34.88, 0, 0], [2, -34.88, 0, 1], [3, -34.88, 0, 1], [10, -34.87, 40, 1], [20, -34.86, 40, 1], [30, -34.86, 0, 0], [40, -34.86, 0, 0]]);

  it('começa na ignição ligada antes da leitura do cartão e termina no pacote de ignição desligada', () => {
    const t = turnoDaJanela(p, { inicio: T0 + 3 * M, fim: T0 + 30 * M, piso: -Infinity })!;
    expect(t.ligou).toBe(T0 + 2 * M);
    expect(t.desligou).toBe(T0 + 30 * M);
    expect(t.pontos).toHaveLength(5);
  });

  it('o recuo não invade o vínculo anterior do mesmo veículo', () => {
    const t = turnoDaJanela(p, { inicio: T0 + 3 * M, fim: T0 + 30 * M, piso: T0 + 2 * M })!;
    expect(t.ligou).toBe(T0 + 3 * M);
  });

  it('vínculo aberto com o motor ligado: sem desligamento (em curso)', () => {
    const t = turnoDaJanela(p.slice(0, 5), { inicio: T0 + 3 * M, fim: null, piso: -Infinity })!;
    expect(t.desligou).toBeNull();
  });

  it('rastreador sem ignição: da primeira à última posição do vínculo', () => {
    const q = pts([[0, -34.88, 0, null], [10, -34.87, 40, null], [20, -34.86, 0, null]]);
    const t = turnoDaJanela(q, { inicio: T0, fim: T0 + 20 * M, piso: -Infinity })!;
    expect([t.ligou, t.desligou]).toEqual([T0, T0 + 20 * M]);
  });

  it('sem posição no vínculo: null', () => {
    expect(turnoDaJanela(p, { inicio: T0 + 50 * M, fim: T0 + 60 * M, piso: -Infinity })).toBeNull();
  });
});

describe('resumo do dia (turnos do mesmo motorista no mesmo veículo)', () => {
  // manhã 08:00–08:30 e tarde 09:30–10:00; a pausa de 1 h com o motor desligado é uma parada
  const manha = turnoDaJanela(pts([[0, -34.88, 0, 1], [10, -34.87, 40, 1], [20, -34.86, 40, 1], [30, -34.86, 0, 0]]), { inicio: T0, fim: T0 + 30 * M, piso: -Infinity })!;
  const tarde = turnoDaJanela(pts([[90, -34.86, 0, 1], [100, -34.85, 40, 1], [120, -34.85, 0, 0]]), { inicio: T0 + 90 * M, fim: T0 + 120 * M, piso: -Infinity })!;

  it('primeira ignição, último desligamento, jornada, motor ligado, km e paradas', () => {
    const r = resumirDia([tarde, manha]);
    expect(r.primeiraIgnicao).toBe(T0);
    expect(r.ultimoDesligamento).toBe(T0 + 120 * M);
    expect(r.jornadaMs).toBe(120 * M);
    expect(r.motorLigadoMs).toBe(60 * M);
    expect(r.ignicoes).toBe(2);
    expect(r.paradas).toBe(1); // a pausa entre os turnos
    expect(r.tempoParadoMs).toBe(60 * M);
    expect(r.km).toBeGreaterThan(3);
    expect(r.km).toBeLessThan(4);
  });

  it('último turno ainda ligado: último desligamento fica em aberto', () => {
    const aberto = { ...tarde, desligou: null };
    expect(resumirDia([manha, aberto]).ultimoDesligamento).toBeNull();
  });

  it('dia no fuso da operação', () => {
    expect(diaNoFuso(Date.parse('2026-09-02T02:00:00Z'), 'America/Recife')).toBe('2026-09-01');
  });
});
