import { describe, expect, it } from 'vitest';
import { idealAt, monthPace, paceStatus } from './pace';

describe('paceStatus', () => {
  it('até o ideal fica dentro do ritmo', () => {
    expect(paceStatus(0, 100, 3000)).toBe('under');
    expect(paceStatus(100, 100, 3000)).toBe('under');
  });
  it('até 20% acima do ideal é pouco acima; depois disso, acima', () => {
    expect(paceStatus(120, 100, 3000)).toBe('approaching');
    expect(paceStatus(120.01, 100, 3000)).toBe('over');
  });
  it('no teto ou além passou, mesmo abaixo do ideal do dia', () => {
    expect(paceStatus(3000, 2900, 3000)).toBe('exceeded');
    expect(paceStatus(3500, 9999, 3000)).toBe('exceeded');
  });
  it('sem teto nem ideal não acusa nada', () => {
    expect(paceStatus(500, 0, 0)).toBe('under');
  });
});

describe('idealAt', () => {
  it('reparte o teto igualmente pelos dias', () => {
    expect(idealAt(3000, 15, 30)).toBe(1500);
    expect(idealAt(3000, 30, 30)).toBe(3000);
    expect(idealAt(3000, 1, 0)).toBe(0);
  });
});

describe('monthPace', () => {
  const now = new Date(2026, 10, 15, 18, 0).getTime(); // 15/11/2026, mês de 30 dias
  it('acumula por dia do mês corrente até hoje e ignora fora do mês', () => {
    const p = monthPace([
      { ts: new Date(2026, 9, 31, 23, 0).getTime(), total: 999 }, // outubro
      { ts: new Date(2026, 10, 1, 8, 0).getTime(), total: 100 },
      { ts: new Date(2026, 10, 1, 20, 0).getTime(), total: 50 },
      { ts: new Date(2026, 10, 3, 9, 0).getTime(), total: 200 },
      { ts: new Date(2026, 10, 15, 19, 0).getTime(), total: 70 }, // depois de agora
    ], now);
    expect(p.days).toBe(30);
    expect(p.today).toBe(15);
    expect(p.cum).toHaveLength(15);
    expect(p.cum.slice(0, 4)).toEqual([150, 150, 350, 350]);
    expect(p.cum[14]).toBe(350);
  });
  it('sem lançamentos devolve zeros até hoje', () => {
    expect(monthPace([], now).cum).toEqual(Array(15).fill(0));
  });
});
