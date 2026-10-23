// Ranking de motoristas: matriz de eventos × pesos (com faixas) e limite de pontos.
// Com Supabase o cálculo é fn_driver_ranking; sem banco, este arquivo faz o mesmo.
import { EVENT_TYPES, FUTURE_CATEGORIES } from './catalog';
import { computeDays } from './jornada';
import { DAY } from './utils';

export interface EvType { code: string; label: string; category: string; weight: number; tiers: { min: number; weight: number }[]; unit?: string; requiresCan?: boolean; active: boolean; custom?: boolean }
export interface RankRow { person_id: string; name: string; points: number; events: number; km: number; points_per_100km: number | null; attention: boolean; by_code: { code: string; label: string; category: string; qty: number; points: number }[] }
export interface Ranking { limit: number; limit_period: string; limit_scaled: number; days: number; drivers: RankRow[] }

export function localTypes(s: any): EvType[] {
  const cfg = s.rankCfg || { types: {}, custom: [] };
  const legacyW = s.eventWeights || {};
  const base = Object.entries(EVENT_TYPES).map(([code, t]) => ({ code, label: t.label, category: t.category, weight: legacyW[code] ?? t.weight, tiers: t.tiers || [], unit: t.unit, requiresCan: t.requiresCan, active: true, ...(cfg.types?.[code] || {}) }));
  const custom = [...(cfg.custom || []), ...(s.customEventTypes || []).filter((c: any) => !(cfg.custom || []).some((x: any) => x.code === c.key)).map((c: any) => ({ code: c.key, label: c.label, weight: c.weight }))]
    .map((c: any) => ({ category: 'empresa', tiers: [], active: true, custom: true, ...c, ...(cfg.types?.[c.code] || {}) }));
  return [...base, ...custom].filter((t) => !FUTURE_CATEGORIES.includes(t.category));
}

export const pointsOf = (t: EvType, value: number | null | undefined) => {
  if (value != null) { const hit = [...(t.tiers || [])].sort((a, b) => b.min - a.min).find((x) => value >= x.min); if (hit) return hit.weight; }
  return t.weight;
};

// violações de jornada viram eventos do ranking (uma por infração apurada)
export function journeyEvents(s: any) {
  return s.drivers.flatMap((d: any) => computeDays(s.journey.filter((m: any) => m.driverId === d.id), d.regime, s.journeyCfg || 2).flatMap((x) => x.violations.map((v) => ({ id: `jv:${d.id}:${x.day}:${v.code}`, ts: x.start || x.day, driverId: d.id, type: 'violacao_jornada', value: null, source: 'jornada' }))));
}

export function localRanking(s: any, from: number, to: number): Ranking {
  const t = Math.min(to, Date.now());
  const types = Object.fromEntries(localTypes(s).filter((x) => x.active).map((x) => [x.code, x]));
  const cfg = s.rankCfg || {};
  const days = Math.max(1, (t - from) / DAY);
  const pdays = cfg.limitPeriod === 'semana' ? 7 : cfg.limitPeriod === 'trimestre' ? 91 : 30;
  const limit = cfg.limit ?? 100;
  const limitScaled = Math.round(limit * days / pdays * 10) / 10;
  const evs = [...s.events, ...journeyEvents(s)].filter((e: any) => e.ts >= from && e.ts <= t && e.driverId && types[e.type]);
  const drivers = s.drivers.map((d: any) => {
    const mine = evs.filter((e: any) => e.driverId === d.id);
    const by: Record<string, any> = {};
    for (const e of mine) { const ty = types[e.type]; by[e.type] ||= { code: e.type, label: ty.label, category: ty.category, qty: 0, points: 0 }; by[e.type].qty++; by[e.type].points += pointsOf(ty, e.value); }
    const assetIds = s.assets.filter((a: any) => a.driverId === d.id).map((a: any) => a.id);
    let km = 0;
    for (const aid of assetIds) { const vals = [...s.fuelings.filter((f: any) => f.assetId === aid && f.ts >= from && f.ts <= t).map((f: any) => f.odometer), ...(s.odometerReadings || []).filter((r: any) => r.assetId === aid && r.ts >= from && r.ts <= t).map((r: any) => r.km)]; if (vals.length > 1) km += Math.max(...vals) - Math.min(...vals); }
    const points = Object.values(by).reduce((x: number, b: any) => x + b.points, 0);
    return { person_id: d.id, name: d.name, points, events: mine.length, km, points_per_100km: km > 0 ? Math.round((points / (km / 100)) * 100) / 100 : null, attention: points > limitScaled, by_code: Object.values(by).sort((a: any, b: any) => b.points - a.points) };
  }).sort((a: any, b: any) => a.points - b.points || a.name.localeCompare(b.name));
  return { limit, limit_period: cfg.limitPeriod || 'mes', limit_scaled: limitScaled, days, drivers };
}
