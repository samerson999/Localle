import { describe, expect, it } from 'vitest';
import type { Point } from './points';
import { routeStats } from './routeStats';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 31, 12);

// AUD-06 (AUDITORIA_KPIS_TELEMETRIA.md): ignição null (rastreador não informa) virava "desligada" e os relatórios
// mostravam 0 h de motor ligado como se fosse medido.
describe('routeStats com ignição desconhecida', () => {
  it('nenhum ponto informa ignição: motor ligado e ocioso são null, e a parada também tem ignição null', () => {
    const pts: Point[] = [
      [T0, -8, -34.9, 40, null],
      [T0 + MIN, -8.01, -34.9, 0, null],
      [T0 + 10 * MIN, -8.01, -34.9, 0, null],
      [T0 + 11 * MIN, -8.02, -34.9, 40, null],
    ];
    const s = routeStats(pts);
    expect(s.engineOn).toBeNull();
    expect(s.idle).toBeNull();
    expect(s.moving).toBe(MIN); // movimento não depende de ignição (conta pelo ponto de chegada: só 10→11 min)
    expect(s.stops).toHaveLength(1);
    expect(s.stops[0].ignition).toBeNull();
  });

  it('ignição informada continua medida: 0 h quando sempre desligada é 0, não null', () => {
    const pts: Point[] = [
      [T0, -8, -34.9, 0, 0],
      [T0 + MIN, -8, -34.9, 0, 0],
      [T0 + 11 * MIN, -8, -34.9, 0, 0],
    ];
    const s = routeStats(pts);
    expect(s.engineOn).toBe(0);
    expect(s.idle).toBe(0);
    expect(s.stops[0].ignition).toBe(false);
  });

  it('trecho com ignição desconhecida não soma motor ligado; os trechos conhecidos somam', () => {
    const pts: Point[] = [
      [T0, -8, -34.9, 40, 1],
      [T0 + MIN, -8.01, -34.9, 40, null],
      [T0 + 2 * MIN, -8.02, -34.9, 40, 1],
      [T0 + 3 * MIN, -8.03, -34.9, 40, 1],
    ];
    expect(routeStats(pts).engineOn).toBe(2 * MIN); // 0→1 e 2→3; o trecho 1→2 começa em ponto desconhecido
  });
});
