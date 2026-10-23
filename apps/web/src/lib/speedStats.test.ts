import { describe, it, expect } from 'vitest';
import { speedLegs } from './speedStats';

describe('speedLegs', () => {
  it('ignora quem nunca passa da velocidade mínima', () => {
    const pts: any[] = [[0, 0, 0, 60, 0], [1000, 0, 0, 70, 0]];
    expect(speedLegs(pts, 80)).toHaveLength(0);
  });

  it('calcula um trecho contínuo acima da velocidade mínima, com máx e média', () => {
    const pts: any[] = [
      [0, 0, 0, 60, 0],
      [1000, 0, 0, 90, 0],
      [2000, 0, 0, 100, 0],
      [3000, 0, 0, 85, 0],
      [4000, 0, 0, 60, 0],
    ];
    const legs = speedLegs(pts, 80);
    expect(legs).toHaveLength(1);
    expect(legs[0].vmax).toBe(100);
    expect(legs[0].vavg).toBeCloseTo((90 + 100 + 85) / 3);
    expect(legs[0].start).toBe(1000);
    expect(legs[0].end).toBe(3000);
  });

  it('descarta picos isolados mais curtos que a duração mínima', () => {
    const pts: any[] = [[0, 0, 0, 60, 0], [1000, 0, 0, 90, 0], [1500, 0, 0, 60, 0]];
    expect(speedLegs(pts, 80, 2000)).toHaveLength(0);
  });

  it('dois trechos separados por velocidade baixa viram duas linhas', () => {
    const pts: any[] = [
      [0, 0, 0, 90, 0], [1000, 0, 0, 90, 0], [2000, 0, 0, 60, 0],
      [3000, 0, 0, 95, 0], [4000, 0, 0, 95, 0],
    ];
    expect(speedLegs(pts, 80)).toHaveLength(2);
  });
});
