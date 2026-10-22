// Indicadores de manutenção. Com Supabase, vêm da função fn_maintenance_kpis (backend);
// sem banco, o mesmo cálculo roda aqui sobre os dados da simulação.
import { operatedIn, opHours } from './assetStatus';
import { DAY, HOUR, monthKey, Period } from './utils';
import { planStatus, critAfter } from './maint';

export interface Kpis {
  from: string; to: string;
  vehicles: number; hours: number; downtime_h: number; availability: number | null; failures: number; mtbf_h: number | null;
  km: number; mkbf: number | null; mttr_h: number; cost_total: number; cost_prev: number; cost_corr: number; n_prev: number; n_corr: number;
  cost_per_km: number | null; overdue_critical: number | null; plan_done: number | null; late_done: number | null; avg_delay_days: number | null;
  by_asset: { asset_id: string; name: string; cost_prev: number; cost_corr: number; cost: number; failures: number; downtime_h: number; km: number }[];
  monthly: { month: string; cost_prev: number; cost_corr: number; failures: number }[];
  top_failures: { title: string; qty: number; cost: number }[];
  overdue_list: { number: number; asset: string; title: string; due_date: string; due_km: number; since: string; status: string }[];
}

function localKpis(s: any, from: number, to: number, assetIds: string[]): Kpis {
  const now = Date.now(); const t = Math.min(to, now); const hours = Math.max(0, (t - from) / HOUR);
  // vendido/baixado conta só até sair da frota (capacidade proporcional às horas em que operou)
  const veh = s.assets.filter((a: any) => a.kind === 'veiculo' && assetIds.includes(a.id) && operatedIn(a, from));
  const fleetH = veh.reduce((m: number, a: any) => m + opHours(a, from, t), 0);
  const ids = veh.map((a: any) => a.id);
  const wo = s.workOrders.filter((w: any) => ids.includes(w.assetId) && w.status !== 'cancelada').map((w: any) => ({ ...w, isFailure: w.type === 'corretiva' && w.unplanned }));
  const downBy: Record<string, number> = {};
  for (const w of wo) if (w.shopInAt && w.shopInAt < t && (w.releasedAt || now) > from) downBy[w.assetId] = (downBy[w.assetId] || 0) + Math.max(0, (Math.min(w.releasedAt || now, t) - Math.max(w.shopInAt, from)) / HOUR);
  const kmBy: Record<string, number> = {};
  for (const id of ids) {
    const vals = [...s.fuelings.filter((f: any) => f.assetId === id && f.ts >= from && f.ts <= t).map((f: any) => f.odometer), ...(s.odometerReadings || []).filter((r: any) => r.assetId === id && r.ts >= from && r.ts <= t).map((r: any) => r.km)];
    kmBy[id] = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
  }
  const done = wo.filter((w: any) => w.status === 'concluida' && w.releasedAt >= from && w.releasedAt <= t);
  const fails = done.filter((w: any) => w.isFailure);
  const sum = (a: number[]) => a.reduce((x, y) => x + (y || 0), 0);
  const nVeh = veh.length, down = sum(Object.values(downBy)), km = sum(Object.values(kmBy));
  const cPrev = sum(done.filter((w: any) => w.type === 'preventiva').map((w: any) => w.cost)), cCorr = sum(done.filter((w: any) => w.type === 'corretiva').map((w: any) => w.cost));
  const rep = fails.filter((w: any) => w.shopInAt);
  const months: Record<string, any> = {};
  for (const w of done) { const k = monthKey(w.releasedAt); months[k] ||= { month: k, cost_prev: 0, cost_corr: 0, failures: 0 }; months[k][w.type === 'preventiva' ? 'cost_prev' : 'cost_corr'] += w.cost || 0; if (w.isFailure) months[k].failures++; }
  const tf: Record<string, any> = {};
  for (const w of fails) { tf[w.title] ||= { title: w.title, qty: 0, cost: 0 }; tf[w.title].qty++; tf[w.title].cost += w.cost || 0; }
  return {
    from: new Date(from).toISOString(), to: new Date(t).toISOString(),
    vehicles: nVeh, hours, downtime_h: down, availability: fleetH > 0 ? 1 - down / fleetH : null, failures: fails.length,
    mtbf_h: fails.length ? (fleetH - down) / fails.length : null, km, mkbf: fails.length ? km / fails.length : null,
    mttr_h: rep.length ? sum(rep.map((w: any) => (w.releasedAt - w.shopInAt) / HOUR)) / rep.length : 0,
    cost_total: cPrev + cCorr, cost_prev: cPrev, cost_corr: cCorr, n_prev: done.filter((w: any) => w.type === 'preventiva').length, n_corr: done.filter((w: any) => w.type === 'corretiva').length,
    cost_per_km: km > 0 ? (cPrev + cCorr) / km : null, overdue_critical: null, plan_done: null, late_done: null, avg_delay_days: null,
    by_asset: veh.map((a: any) => { const d = done.filter((w: any) => w.assetId === a.id); return { asset_id: a.id, name: a.name, cost_prev: sum(d.filter((w: any) => w.type === 'preventiva').map((w: any) => w.cost)), cost_corr: sum(d.filter((w: any) => w.type === 'corretiva').map((w: any) => w.cost)), cost: sum(d.map((w: any) => w.cost)), failures: d.filter((w: any) => w.isFailure).length, downtime_h: downBy[a.id] || 0, km: kmBy[a.id] || 0 }; }).sort((x: any, y: any) => y.cost - x.cost),
    monthly: Object.values(months).sort((x: any, y: any) => x.month.localeCompare(y.month)),
    top_failures: Object.values(tf).sort((x: any, y: any) => y.qty - x.qty).slice(0, 8) as any,
    ...localOverdue(s, from, t, ids),
  };
}

// Preventivas vencidas e atrasos, calculados sobre o histórico da simulação.
// Regra igual à de "Precisa de você": passou do prazo de crítico do plano (maint.critAfter) vira crítica.
// Conta toda OS que esteve crítica em algum momento do período (inclusive as que continuam críticas).
function localOverdue(s: any, from: number, to: number, ids: string[]) {
  const now = Date.now();
  const name = (id: string) => s.assets.find((a: any) => a.id === id)?.name || id;
  const iso = (x: number) => new Date(x).toISOString().slice(0, 10);
  const list: Kpis['overdue_list'] = [];
  let planDone = 0, lateDone = 0; const delays: number[] = [];
  for (const p of s.plans) for (const aid of p.assetIds) {
    if (!ids.includes(aid)) continue;
    const done = s.workOrders.filter((w: any) => w.assetId === aid && w.status === 'concluida' && w.releasedAt && w.services?.includes(p.service)).sort((a: any, b: any) => a.releasedAt - b.releasedAt);
    done.forEach((prev: any, i: number) => {
      const next = done[i + 1];
      const due = p.daysInterval > 0 ? prev.releasedAt + p.daysInterval * DAY : null;
      const dueKm = p.kmInterval > 0 && prev.odometerAt ? prev.odometerAt + p.kmInterval : null;
      if (next && next.type === 'preventiva' && next.releasedAt >= from && next.releasedAt <= to) {
        planDone++;
        const lateT = due != null && next.releasedAt > due, lateK = dueKm != null && next.odometerAt > dueKm;
        if (lateT || lateK) { lateDone++; if (lateT) delays.push((next.releasedAt - due!) / DAY); }
      }
      if (due == null) return;
      const crit = due + critAfter(p).days * DAY, end = next ? next.releasedAt : now;
      if (end > crit && crit <= to && end >= from) list.push({ number: next?.num ?? s.workOrders.find((w: any) => w.assetId === aid && w.planId === p.id && !['concluida', 'cancelada'].includes(w.status))?.num ?? 0, asset: name(aid), title: p.name, due_date: iso(due), due_km: dueKm ?? 0, since: new Date(crit).toISOString(), status: next ? 'concluida' : 'aberta' });
    });
    // crítica por km agora (sem data de vencimento): entra quando o período inclui hoje
    const st = planStatus(s, p, aid);
    if (to >= now - DAY && st.level === 'crit' && !st.critSince && !list.some((o) => o.asset === name(aid) && o.title === p.name && o.status === 'aberta'))
      list.push({ number: st.open?.num ?? 0, asset: name(aid), title: p.name, due_date: '', due_km: st.nextKm ?? 0, since: new Date(now).toISOString(), status: 'aberta' });
  }
  return { overdue_critical: list.length, plan_done: planDone, late_done: lateDone, avg_delay_days: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0, overdue_list: list.sort((a, b) => b.since.localeCompare(a.since)) };
}

// No produto real este cálculo é do backend: fn_maintenance_kpis em docs/especificacao-sql/20261017120000_bi_manutencao.sql
export async function fetchKpis(s: any, from: number, to: number, assetIds: string[]): Promise<Kpis> {
  return localKpis(s, from, to, assetIds);
}

// Período de comparação: anterior equivalente ou o mesmo período do ano anterior
export function previousPeriod(p: Period, mode: 'anterior' | 'ano_anterior'): Period {
  if (mode === 'ano_anterior') {
    if (p.kind === 'custom') return { ...p, from: shiftYear(p.from!), to: shiftYear(p.to!) };
    return { ...p, year: p.year - 1 };
  }
  const count = { mes: 12, trimestre: 4, semestre: 2, ano: 1 } as any;
  if (p.kind === 'ano') return { ...p, year: p.year - 1 };
  if (p.kind === 'custom') {
    const f = new Date(p.from + 'T00:00').getTime(), t = new Date(p.to + 'T00:00').getTime(); const span = t - f + 86400000;
    const iso = (x: number) => new Date(x).toISOString().slice(0, 10);
    return { ...p, from: iso(f - span), to: iso(t - span) };
  }
  return p.idx > 0 ? { ...p, idx: p.idx - 1 } : { ...p, idx: count[p.kind] - 1, year: p.year - 1 };
}
const shiftYear = (d: string) => `${+d.slice(0, 4) - 1}${d.slice(4)}`;
