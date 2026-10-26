// Relatório de velocidade: trechos contínuos acima de uma velocidade mínima (filtro opcional) e com
// duração mínima (para ignorar picos isolados). Cada trecho mostra velocidade máxima e média.
// Implementação única: a API (GET /reports/velocidade) aplica esta função sobre as posições do banco, e
// o front sobre a simulação — os testes (speedStats.test.ts) são os casos de aceite dos dois.
import type { Point } from './points';

export type SpeedLeg = { start: number; end: number; startPos: [number, number]; endPos: [number, number]; vmax: number; vavg: number; maxPos: [number, number] };

export function speedLegs(points: Point[], minSpeed: number, minDurationMs = 0): SpeedLeg[] {
  const out: SpeedLeg[] = [];
  let leg: Point[] = [];
  const close = () => {
    if (leg.length > 1) {
      const start = leg[0][0], end = leg[leg.length - 1][0];
      if (end - start >= minDurationMs) {
        const vmax = Math.max(...leg.map((p) => p[3]));
        const vavg = leg.reduce((s, p) => s + p[3], 0) / leg.length;
        const maxPt = leg.find((p) => p[3] === vmax)!;
        out.push({ start, end, startPos: [leg[0][1], leg[0][2]], endPos: [leg[leg.length - 1][1], leg[leg.length - 1][2]], vmax, vavg, maxPos: [maxPt[1], maxPt[2]] });
      }
    }
    leg = [];
  };
  for (const p of points) {
    if (p[3] >= minSpeed) leg.push(p);
    else close();
  }
  close();
  return out;
}
