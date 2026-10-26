// Relatório "Passou por aqui": passagens de veículos dentro de um raio de um ponto do mapa.
// Uma passagem = sequência contínua de posições dentro do raio; passagens do mesmo veículo separadas
// por mais de GAP_MIN minutos contam como passagens diferentes (mesmo que o raio não tenha uma saída
// e reentrada registrada no meio — ex.: o veículo ficou longas horas fora e voltou).
// Implementação única: a API (GET /reports/passou-por-aqui) pré-filtra no PostGIS (ST_DWithin) e aplica
// esta função sobre as posições do banco; o front, sobre a simulação. Testes: nearbyStats.test.ts.
import { haversine } from './utils';
import type { Point } from './points';

export const GAP_MIN = 5;

export type NearbyPass = { enter: number; exit: number; minDist: number; minDistPos: [number, number]; speedAtClosest: number };

export function nearbyPasses(points: Point[], center: [number, number], radiusM: number): NearbyPass[] {
  const inside = points.filter((p) => haversine([p[1], p[2]], center) <= radiusM);
  const out: NearbyPass[] = [];
  let group: Point[] = [];
  const close = () => {
    if (group.length) {
      let minDist = Infinity, minPt = group[0];
      for (const p of group) { const d = haversine([p[1], p[2]], center); if (d < minDist) { minDist = d; minPt = p; } }
      out.push({ enter: group[0][0], exit: group[group.length - 1][0], minDist, minDistPos: [minPt[1], minPt[2]], speedAtClosest: minPt[3] });
    }
    group = [];
  };
  for (const p of inside) {
    if (group.length && p[0] - group[group.length - 1][0] > GAP_MIN * 60000) close();
    group.push(p);
  }
  close();
  return out;
}
