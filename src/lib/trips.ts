// Viagens: portaria (saída/entrada), viagens externas por etapas, matriz de viagens recorrentes e indicadores
// de tempo e km sem viagem / sem carga. NO PRODUTO REAL estes cálculos rodam no backend.
import { DAY, HOUR, MIN } from './utils';

// Parâmetros do Setup (docs/PLANO-SETUP-ADMIN.md 3.13)
// tolMin: tolerância de horário no cumprimento da matriz; noTripAlertMin: minutos rodando sem viagem após concluir uma
// viagem externa até sinalizar ao monitoramento; returnHour: hora-limite padrão de volta para quem saiu pela portaria;
// noTripPriority: prioridade do aviso "Rodando sem viagem", só baixa ou média (nunca alta: não torna o veículo crítico).
export const TRIP_PARAMS = { tolMin: 30, noTripAlertMin: 10, returnHour: 18, noTripPriority: 'media' as NoTripPriority };
export type NoTripPriority = 'baixa' | 'media';
export const noTripPriority = (p = TRIP_PARAMS.noTripPriority): NoTripPriority => (p === 'baixa' ? 'baixa' : 'media');

// Recursos futuros, escondidos da interface: sensor de porta do baú e integração com o órgão de transporte intermunicipal.
export const FUTURE_TRIP_FEATURES = ['sensor_porta', 'orgao_intermunicipal'];

export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const atTime = (day0: number, hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return day0 + h * HOUR + m * MIN; };
const day0Of = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// ---------- portaria ----------
export const lastGate = (s: any, assetId: string) => (s.gateLog || []).filter((g: any) => g.assetId === assetId).reduce((m: any, g: any) => (!m || g.ts > m.ts ? g : m), null);
export const nextGateKind = (s: any, assetId: string): 'saida' | 'entrada' => (lastGate(s, assetId)?.kind === 'saida' ? 'entrada' : 'saida');
// a sequência precisa alternar: não pode haver duas saídas (ou duas entradas) seguidas
export function gateError(s: any, assetId: string, kind: 'saida' | 'entrada') {
  const last = lastGate(s, assetId);
  if (kind === 'saida' && last?.kind === 'saida') return `Este veículo já tem uma saída registrada em ${new Date(last.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} sem entrada. Registre a entrada primeiro.`;
  if (kind === 'entrada' && last?.kind !== 'saida') return 'Não há saída aberta para este veículo. Registre a saída primeiro.';
  return '';
}
// quem está na rua (última marcação é saída) e quem precisa voltar (passou da volta prevista)
export function onStreet(s: any, now = Date.now()) {
  return s.assets.map((a: any) => ({ a, g: lastGate(s, a.id) })).filter((x: any) => x.g?.kind === 'saida').map((x: any) => {
    const due = x.g.returnBy ?? atTime(day0Of(x.g.ts), `${TRIP_PARAMS.returnHour}:00`);
    return { ...x, due, overdue: now > due, out: now - x.g.ts };
  }).sort((p: any, q: any) => Number(q.overdue) - Number(p.overdue) || p.due - q.due);
}

// ---------- viagens externas ----------
export const STAGES = [{ key: 'originFenceId', at: 'startedAt', label: 'Origem' }, { key: 'loadFenceId', at: 'loadedAt', label: 'Carga' }, { key: 'unloadFenceId', at: 'unloadedAt', label: 'Descarga' }, { key: 'destFenceId', at: 'endedAt', label: 'Destino' }] as const;
// com carga entre a chegada na carga e a chegada na descarga
export const isLoaded = (t: any) => !!t.loadedAt && !t.unloadedAt;

// ---------- indicadores por dia (acumulados pela simulação em tripStats[dia][veículo]) ----------
// mv: segundos rodando; nt: segundos rodando sem viagem; kmNt: km sem viagem; kmEmpty: km em viagem sem carga; kmLoaded: km com carga; kmTrip: km em viagem de pátio (carga não informada)
export interface DayStat { mv: number; nt: number; kmNt: number; kmEmpty: number; kmLoaded: number; kmTrip: number }
export const emptyStat = (): DayStat => ({ mv: 0, nt: 0, kmNt: 0, kmEmpty: 0, kmLoaded: 0, kmTrip: 0 });
export function statsIn(s: any, from: number, to: number, keep: (assetId: string) => boolean = () => true) {
  const out: Record<string, DayStat> = {}; const byDay: Record<string, DayStat> = {};
  for (const [day, per] of Object.entries<any>(s.tripStats || {})) {
    const t = new Date(day + 'T12:00').getTime(); if (t < day0Of(from) || t > to) continue;
    for (const [aid, st] of Object.entries<any>(per)) {
      if (!keep(aid)) continue;
      const o = (out[aid] ||= emptyStat()); const d = (byDay[day] ||= emptyStat());
      for (const k of Object.keys(st) as (keyof DayStat)[]) { o[k] += st[k] || 0; d[k] += st[k] || 0; }
    }
  }
  const total = Object.values(out).reduce((m, x) => { for (const k of Object.keys(x) as (keyof DayStat)[]) m[k] += x[k]; return m; }, emptyStat());
  return { perAsset: out, byDay, total };
}
export const tripsIn = (s: any, from: number, to: number) => s.trips.filter((t: any) => t.status === 'concluida' && t.endedAt >= from && t.endedAt <= to);

// ---------- matriz de viagens recorrentes: planejado × realizado ----------
export type StopStatus = 'no_horario' | 'atrasado' | 'adiantado' | 'nao_feito' | 'futuro';
export function compliance(s: any, m: any, from: number, to: number, now = Date.now()) {
  const tol = TRIP_PARAMS.tolMin * MIN;
  const visits = (s.fenceVisits || []).filter((v: any) => v.a === m.assetId);
  const days: any[] = [];
  // só a partir da criação da matriz: antes dela não havia o que cumprir
  for (let d = day0Of(Math.max(from, m.createdAt || 0)); d <= Math.min(to, now); d += DAY) {
    const dd = day0Of(d + 2 * HOUR); // ajuste de horário de verão
    const wd = new Date(dd).getDay();
    if (!m.days.includes(wd)) continue;
    const stops = m.stops.map((st: any) => {
      const plan = atTime(dd, st.time);
      if (plan + tol > now) return { ...st, plan, status: 'futuro' as StopStatus };
      const cand = visits.filter((v: any) => v.f === st.fenceId && v.ts >= dd && v.ts < dd + DAY).sort((p: any, q: any) => Math.abs(p.ts - plan) - Math.abs(q.ts - plan))[0];
      if (!cand) return { ...st, plan, status: 'nao_feito' as StopStatus };
      const diff = cand.ts - plan;
      return { ...st, plan, at: cand.ts, diff, status: (Math.abs(diff) <= tol ? 'no_horario' : diff > 0 ? 'atrasado' : 'adiantado') as StopStatus };
    });
    // onde dormiu: última cerca em que entrou a partir das 18 h (só para dias já encerrados)
    const plannedSleep = m.sleep?.[wd];
    const night = dd + DAY <= now ? visits.filter((v: any) => v.ts >= dd + 18 * HOUR && v.ts < dd + DAY + 4 * HOUR).sort((p: any, q: any) => q.ts - p.ts)[0] : null;
    days.push({ day: dd, wd, stops, sleep: plannedSleep ? { planned: plannedSleep, real: night?.f ?? null, ok: night ? night.f === plannedSleep : null } : null });
  }
  const done = days.flatMap((d) => d.stops).filter((x: any) => x.status !== 'futuro');
  const n = (k: StopStatus) => done.filter((x: any) => x.status === k).length;
  const sleeps = days.map((d) => d.sleep).filter((x) => x && x.ok != null);
  return { days, total: done.length, onTime: n('no_horario'), late: n('atrasado') + n('adiantado'), missed: n('nao_feito'), rate: done.length ? n('no_horario') / done.length : null, sleepOk: sleeps.filter((x: any) => x.ok).length, sleepTotal: sleeps.length };
}

// ---------- simulação: 60 dias de histórico ----------
export function seedTripHistory(assets: any[], matrices: any[], fences: any[], now: number, R: (a: number, b: number) => number) {
  const tripStats: Record<string, Record<string, DayStat>> = {};
  const fenceVisits: { a: string; f: string; ts: number }[] = [];
  const trips: any[] = [];
  const gateLog: any[] = [];
  const DRV: Record<string, string> = { a3: 'd3', a5: 'd4', a6: 'd5' };
  const vehs = assets.filter((a: any) => a.kind === 'veiculo' && a.tracker && a.id !== 'a7');
  const heavy = new Set(['a1', 'a2', 'a10', 'a4']);
  const today0 = day0Of(now);
  for (let i = 60; i >= 1; i--) {
    const d0 = day0Of(today0 - i * DAY + 2 * HOUR); const wd = new Date(d0).getDay(); const key = dayKey(d0);
    const per: Record<string, DayStat> = (tripStats[key] = {});
    for (const a of vehs) {
      if (wd === 0 && Math.random() < 0.8) continue;
      const kmDay = heavy.has(a.id) ? R(120, 340) : R(40, 140);
      // a frota melhora um pouco nas últimas semanas (menos km sem viagem e sem carga)
      const trend = i < 30 ? 0.85 : 1;
      const ntShare = (a.id === 'a5' ? 0.32 : a.id === 'a3' ? 0.2 : 0.09) * trend * R(0.6, 1.4);
      const emptyShare = heavy.has(a.id) ? (a.id === 'a2' ? 0.38 : 0.24) * trend * R(0.7, 1.3) : 0;
      const kmNt = kmDay * ntShare; const kmLoaded = heavy.has(a.id) ? (kmDay - kmNt) * (1 - emptyShare) : 0;
      const kmEmpty = heavy.has(a.id) ? kmDay - kmNt - kmLoaded : 0; const kmTrip = heavy.has(a.id) ? 0 : kmDay - kmNt;
      const mv = (kmDay / R(38, 55)) * 3600;
      per[a.id] = { mv, nt: mv * ntShare * R(0.9, 1.3), kmNt, kmEmpty, kmLoaded, kmTrip };
    }
    // viagens externas concluídas (cavalos e Atego): origem → carga → descarga → destino
    for (const aid of ['a1', 'a2', 'a10', 'a4']) {
      if (wd === 0 || Math.random() < 0.35) continue;
      const start = d0 + R(5, 9) * HOUR; const load = start + R(0.5, 2) * HOUR; const unload = load + R(1.5, 4) * HOUR; const end = unload + R(0.6, 2.5) * HOUR;
      const toSuape = Math.random() < 0.5;
      trips.push({ id: `tx-${aid}-${key}`, type: 'externo', name: toSuape ? 'Coleta Candeias → Obra Suape' : 'Coleta Suape → Atacadão Candeias', assetId: aid, originFenceId: 'f1', loadFenceId: toSuape ? 'f5' : 'f7', unloadFenceId: toSuape ? 'f7' : 'f5', destFenceId: 'f1', cargo: toSuape ? 'Cimento ensacado' : 'Brita', status: 'concluida', startedAt: start, loadedAt: load, unloadedAt: unload, endedAt: end, startSource: 'rastreador', stops: [], visited: [] });
    }
    // matriz recorrente: visitas reais às paradas, com atrasos e faltas ocasionais
    for (const m of matrices) {
      if (!m.days.includes(wd)) continue;
      for (const st of m.stops) {
        const r = Math.random(); if (r < 0.06) continue; // parada não feita
        const late = r < 0.18 ? R(35, 80) : R(-15, 20);
        fenceVisits.push({ a: m.assetId, f: st.fenceId, ts: atTime(d0, st.time) + late * MIN });
      }
      const sl = m.sleep?.[wd]; if (sl) fenceVisits.push({ a: m.assetId, f: Math.random() < 0.9 ? sl : fences.find((f: any) => f.startsTrip && f.id !== sl)?.id || sl, ts: d0 + R(18.5, 21) * HOUR });
    }
    // portaria: saídas e entradas dos utilitários da distribuição
    for (const aid of ['a3', 'a5', 'a6']) {
      if (wd === 0) continue;
      const out = d0 + R(6.5, 8) * HOUR; const back = d0 + R(16, i % 9 === 0 ? 20 : 18.2) * HOUR;
      gateLog.push({ id: `gt-${aid}-${key}-s`, ts: out, assetId: aid, driverId: DRV[aid], kind: 'saida', km: 0, by: 'Portaria Matriz', baseId: 'f1' }, { id: `gt-${aid}-${key}-e`, ts: back, assetId: aid, driverId: DRV[aid], kind: 'entrada', km: 0, by: 'Portaria Matriz', baseId: 'f1' });
    }
  }
  // hoje: dois utilitários na rua, um deles já devia ter voltado
  gateLog.push({ id: 'gt-a3-hoje', ts: now - 9 * HOUR, assetId: 'a3', driverId: 'd3', kind: 'saida', km: 0, by: 'Portaria Matriz', baseId: 'f1', returnBy: now - 40 * MIN });
  gateLog.push({ id: 'gt-a6-hoje', ts: now - 5 * HOUR, assetId: 'a6', driverId: 'd5', kind: 'saida', km: 0, by: 'Portaria Matriz', baseId: 'f1', returnBy: now + 3 * HOUR });
  return { tripStats, fenceVisits, trips, gateLog };
}
