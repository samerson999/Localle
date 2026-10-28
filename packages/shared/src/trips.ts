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

