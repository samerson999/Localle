import { describe, it, expect } from 'vitest';
import { fencePassages, GAP_MIN } from './fenceStats';

const fence = { id: 'f1', shape: 'circle', center: [0, 0], radius: 100 };
const inside = [0, 0]; // dentro do raio de 100 m
const outside = [1, 1]; // bem fora

describe('fencePassages', () => {
  it('detecta entrada e saída simples', () => {
    const pts: any[] = [
      [0, ...outside, 0, 0],
      [1000, ...inside, 0, 0],
      [2000, ...inside, 0, 0],
      [3000, ...outside, 0, 0],
    ];
    const out = fencePassages(pts, fence, 10000);
    expect(out).toHaveLength(1);
    expect(out[0].enter).toBe(1000);
    expect(out[0].exit).toBe(3000);
  });

  it('marca "ainda na cerca" quando o período acaba com o veículo dentro', () => {
    const pts: any[] = [[0, ...outside, 0, 0], [1000, ...inside, 0, 0]];
    const out = fencePassages(pts, fence, 5000);
    expect(out[0].exit).toBeNull();
  });

  it('sinaliza gap de sinal maior que 30 min dentro da cerca', () => {
    const gapMs = (GAP_MIN + 1) * 60000;
    const pts: any[] = [[0, ...inside, 0, 0], [gapMs, ...inside, 0, 0], [gapMs + 1000, ...outside, 0, 0]];
    const out = fencePassages(pts, fence, gapMs + 2000);
    expect(out[0].gapFlagged).toBe(true);
  });

  it('não sinaliza gap quando as posições dentro são frequentes', () => {
    const pts: any[] = [[0, ...inside, 0, 0], [60000, ...inside, 0, 0], [120000, ...outside, 0, 0]];
    const out = fencePassages(pts, fence, 130000);
    expect(out[0].gapFlagged).toBe(false);
  });

  it('duas passagens separadas viram duas linhas', () => {
    const pts: any[] = [
      [0, ...inside, 0, 0], [1000, ...outside, 0, 0],
      [2000, ...inside, 0, 0], [3000, ...outside, 0, 0],
    ];
    const out = fencePassages(pts, fence, 4000);
    expect(out).toHaveLength(2);
  });
});
