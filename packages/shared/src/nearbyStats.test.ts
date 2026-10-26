import { describe, it, expect } from 'vitest';
import { nearbyPasses } from './nearbyStats';

const center: [number, number] = [0, 0];

describe('nearbyPasses', () => {
  it('agrupa posições contínuas dentro do raio numa passagem só', () => {
    const pts: any[] = [[0, 0, 0, 40, 0], [15000, 0.0005, 0.0005, 38, 0], [30000, 0.001, 0.001, 35, 0]];
    const out = nearbyPasses(pts, center, 200);
    expect(out).toHaveLength(1);
    expect(out[0].enter).toBe(0);
    expect(out[0].exit).toBe(30000);
  });

  it('separa passagens do mesmo veículo por mais de 5 min', () => {
    const gap = 6 * 60000;
    const pts: any[] = [[0, 0, 0, 40, 0], [gap, 0, 0, 20, 0]];
    const out = nearbyPasses(pts, center, 200);
    expect(out).toHaveLength(2);
  });

  it('usa a velocidade no ponto de menor distância', () => {
    const pts: any[] = [[0, 0.001, 0.001, 50, 0], [1000, 0, 0, 10, 0], [2000, 0.001, 0.001, 50, 0]];
    const out = nearbyPasses(pts, center, 200);
    expect(out[0].speedAtClosest).toBe(10);
  });

  it('ignora posições fora do raio', () => {
    const pts: any[] = [[0, 1, 1, 90, 0]];
    expect(nearbyPasses(pts, center, 200)).toHaveLength(0);
  });
});
