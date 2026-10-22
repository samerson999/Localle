// Resumo de um percurso (pontos [ts, lat, lng, km/h, ignição 0/1]): usado no Replay e nos Relatórios.
// Parada = mais de STOP_MIN parado (≤ 3 km/h); a parada em curso no fim do período também conta.
// NO PRODUTO REAL o backend devolve esse resumo pronto (agregado por hora no TimescaleDB).
import { haversine } from './utils';

export const STOP_MIN = 5;
export type Stop = { ts: number; end: number; pos: [number, number]; ignition: boolean };
export type RouteStats = { dist: number; moving: number; engineOn: number; idle: number; vmax: number; stops: Stop[] };

export function routeStats(pts: any[]): RouteStats {
  let dist = 0, moving = 0, engineOn = 0, idle = 0, vmax = 0, stopStart: any = null;
  const stops: Stop[] = [];
  const close = (end: number) => { if (stopStart && end - stopStart[0] > STOP_MIN * 60000) stops.push({ ts: stopStart[0], end, pos: [stopStart[1], stopStart[2]], ignition: !!stopStart[4] }); stopStart = null; };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dt = b[0] - a[0];
    dist += haversine([a[1], a[2]], [b[1], b[2]]);
    if (a[4]) engineOn += dt;
    if (b[3] > 3) { moving += dt; close(b[0]); }
    else { if (a[4] && a[3] <= 3) idle += dt; if (!stopStart) stopStart = b; }
    vmax = Math.max(vmax, b[3]);
  }
  if (pts.length) close(pts[pts.length - 1][0]);
  return { dist: dist / 1000, moving, engineOn, idle, vmax, stops };
}
