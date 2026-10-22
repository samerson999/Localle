// Relatório de cercas: passagens de um veículo por uma cerca (entrada, saída, permanência).
// Entrada = primeira posição dentro da cerca; saída = primeira posição fora dela (ou o fim do período,
// se o veículo ainda estiver dentro). Permanência = saída menos entrada.
// NO PRODUTO REAL essa regra roda no backend (PostGIS: ST_Contains/ST_DWithin sobre as posições do
// TimescaleDB), disparando o evento de entrada/saída no momento em que ele acontece, em vez de varrer o
// histórico depois. Este arquivo é a especificação do comportamento — os testes (fenceStats.test.ts)
// valem como casos de aceite para a implementação em PostGIS.
import { inFence } from './utils';
import type { Point } from './positionsSource';

export const GAP_MIN = 30; // minutos sem posição dentro da cerca: sinaliza perda de sinal

export type FencePassage = {
  fenceId: string;
  enter: number;
  exit: number | null; // null = ainda na cerca no fim do período
  enterPos: [number, number];
  exitPos: [number, number];
  gapFlagged: boolean;
};

export function fencePassages(points: Point[], fence: any, periodEnd: number): FencePassage[] {
  const out: FencePassage[] = [];
  let open: FencePassage | null = null;
  let lastInsideTs = 0;
  for (const p of points) {
    const inside = inFence([p[1], p[2]], fence);
    if (inside && !open) {
      open = { fenceId: fence.id, enter: p[0], exit: null, enterPos: [p[1], p[2]], exitPos: [p[1], p[2]], gapFlagged: false };
      lastInsideTs = p[0];
    } else if (inside && open) {
      if (p[0] - lastInsideTs > GAP_MIN * 60000) open.gapFlagged = true;
      lastInsideTs = p[0];
    } else if (!inside && open) {
      open.exit = p[0];
      open.exitPos = [p[1], p[2]];
      out.push(open);
      open = null;
    }
  }
  if (open) { if (periodEnd - lastInsideTs > GAP_MIN * 60000) open.gapFlagged = true; out.push(open); } // ainda na cerca: exit fica null
  return out;
}

export const stayMs = (p: FencePassage, periodEnd: number) => (p.exit ?? periodEnd) - p.enter;
