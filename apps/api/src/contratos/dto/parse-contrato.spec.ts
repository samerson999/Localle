import { describe, expect, it } from 'vitest';
import { parseCompetencia, parseData } from './parse-contrato';

describe('parseData', () => {
  it('aceita data real', () => {
    expect(parseData('x', '2026-02-28')).toBe('2026-02-28');
    expect(parseData('x', '2028-02-29')).toBe('2028-02-29'); // bissexto
  });

  // regressão (pentest 24/10/2026): Date.parse('2026-02-31') não é NaN no V8 e a data chegava ao Postgres → 500
  it.each(['2026-02-31', '2026-04-31', '2027-02-29', '2026-13-01', '2026-1-01', '', 20260101, null])('rejeita %j com 400', (v) => {
    expect(() => parseData('x', v)).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('parseCompetencia', () => {
  it('só AAAA-MM com mês 01–12', () => {
    expect(parseCompetencia('2026-09')).toBe('2026-09');
    for (const v of ['2026-9', '2026-00', '2026-13', '0000-00x', undefined]) expect(() => parseCompetencia(v)).toThrow();
  });
});
