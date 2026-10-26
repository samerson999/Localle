// Camada de acesso a posições: isola de onde vêm os pontos [ts, lat, lng, km/h, ignição] de 0 a 1.
// Duas implementações: simulação local (histórico gravado no navegador) e API real (sob demanda, como o Replay).
// NO PRODUTO REAL isto é uma única chamada ao nosso backend (lê o nosso banco, nunca a API do Traccar nem a
// API antiga "user" diretamente): o front não precisa saber se o veículo é real ou simulado.
import { fetchRoute } from './rastreioApi';
import { fetchRoute as fetchLocalleRoute } from './localleApi';

export type { Point } from '@localle/shared/points';
import type { Point } from '@localle/shared/points';

// Percurso de um veículo real, da origem certa: nosso backend (tracker.source = 'localle') ou a API antiga.
export async function fetchLiveRoute(asset: any, from: number, to: number): Promise<Point[]> {
  if (asset?.tracker?.source === 'localle') return fetchLocalleRoute(asset.id, from, to) as Promise<Point[]>;
  return fetchRoute(asset.tracker.imei, from, to);
}

export async function fetchPositions(asset: any, history: Record<string, any[]>, from: number, to: number): Promise<Point[]> {
  if (asset?.tracker?.live && (asset?.tracker?.imei || asset?.tracker?.source === 'localle')) return fetchLiveRoute(asset, from, to);
  return (history[asset.id] || []).filter((p: Point) => p[0] >= from && p[0] <= to);
}
