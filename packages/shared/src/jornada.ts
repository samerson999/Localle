import { DAY, HOUR, MIN, startOfDay } from './utils';

export interface DayCalc { day: number; start?: number; end?: number; worked: number; driving: number; meal: number; wait: number; rest: number; extra: number; night: number; maxCont: number; interjornada?: number; violations: { code: string; label: string; detail: string }[]; open: boolean }

export const LEGAL = {
  base: 8 * HOUR,
  meal: 1 * HOUR,
  inter: 11 * HOUR,
  weekly: 35 * HOUR,
  contCargas: 5.5 * HOUR,
  contPassageiros: 4 * HOUR,
};

// Limites efetivos do cliente: a lei é piso, o cliente só endurece (parâmetros do Setup "jornada.*", docs/PLANO-SETUP-ADMIN.md 3.1).
// Valores fora do sentido permitido voltam ao limite legal.
export const HARDEN: Record<string, { legal: number; dir: 'down' | 'up'; label: string; ref: string }> = {
  baseH: { legal: 8, dir: 'down', label: 'Jornada diária (h)', ref: 'CLT art. 235-C' },
  maxExtra: { legal: 4, dir: 'down', label: 'Horas extras por dia (h)', ref: 'CLT art. 235-C; acima de 2h exige convenção coletiva' },
  mealH: { legal: 1, dir: 'up', label: 'Refeição mínima (h)', ref: 'CLT art. 235-C §2º' },
  interH: { legal: 11, dir: 'up', label: 'Interjornada mínima (h)', ref: 'CLT art. 235-C §3º' },
  weeklyH: { legal: 35, dir: 'up', label: 'Descanso semanal mínimo (h)', ref: 'CLT art. 235-D' },
  contCargasH: { legal: 5.5, dir: 'down', label: 'Direção contínua máx., cargas (h)', ref: 'CTB art. 67-C' },
  contPassageirosH: { legal: 4, dir: 'down', label: 'Direção contínua máx., passageiros (h)', ref: 'CTB art. 67-C' },
};
export const clampLegal = (k: string, v: any) => { const h = HARDEN[k]; const n = +v; if (v === '' || v == null || isNaN(n) || n <= 0) return h.legal; return h.dir === 'down' ? Math.min(n, h.legal) : Math.max(n, h.legal); };
export function jornadaLimits(cfg: any = {}) {
  const g = (k: string, d?: number) => clampLegal(k, cfg[k] ?? d);
  return { base: g('baseH') * HOUR, maxExtraH: Math.min(g('maxExtra', 2), 4), meal: g('mealH') * HOUR, inter: g('interH') * HOUR, weekly: g('weeklyH') * HOUR, contCargas: g('contCargasH') * HOUR, contPassageiros: g('contPassageirosH') * HOUR };
}

const hh = (ms: number) => { const h = Math.floor(ms / HOUR), m = Math.round((ms % HOUR) / MIN); return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`; };

function nightOverlap(a: number, b: number) {
  let tot = 0;
  for (let d = startOfDay(a) - DAY; d <= b; d += DAY) {
    const n1 = d + 22 * HOUR, n2 = d + 29 * HOUR; // 22h → 05h
    tot += Math.max(0, Math.min(b, n2) - Math.max(a, n1));
  }
  return tot;
}

export function computeDays(marks: any[], regime = 'cargas', cfg: any = 2, now = Date.now()): DayCalc[] {
  const L = jornadaLimits(typeof cfg === 'number' ? { maxExtra: cfg } : cfg); const maxExtraH = L.maxExtraH;
  const ms = [...marks].sort((a, b) => a.ts - b.ts);
  const shifts: any[][] = [];
  let cur: any[] | null = null;
  for (const m of ms) {
    if (m.type === 'inicio_jornada') { cur = [m]; shifts.push(cur); }
    else if (cur) { cur.push(m); if (m.type === 'fim_jornada') cur = null; }
  }
  const out: DayCalc[] = [];
  let prevEnd: number | undefined;
  const contLimit = regime === 'passageiros' ? L.contPassageiros : L.contCargas;
  for (const sh of shifts) {
    const start = sh[0].ts;
    const endM = sh.find((m) => m.type === 'fim_jornada');
    const end = endM?.ts ?? Math.min(now, start + 20 * HOUR);
    const span = (open: string, close: string[]) => { let t = 0, s: number | null = null; const segs: number[] = []; for (const m of sh) { if (m.type === open) s = m.ts; else if (s !== null && close.includes(m.type)) { t += m.ts - s; segs.push(m.ts - s); s = null; } } if (s !== null) { t += end - s; segs.push(end - s); } return { t, segs }; };
    const drv = span('inicio_direcao', ['fim_direcao', 'inicio_refeicao', 'inicio_espera', 'inicio_descanso', 'fim_jornada']);
    const meal = span('inicio_refeicao', ['fim_refeicao', 'fim_jornada']).t;
    const wait = span('inicio_espera', ['fim_espera', 'fim_jornada']).t;
    const rest = span('inicio_descanso', ['fim_descanso', 'fim_jornada']).t;
    const worked = Math.max(0, end - start - meal - wait - rest);
    const extra = Math.max(0, worked - L.base);
    const maxCont = Math.max(0, ...drv.segs);
    const v: DayCalc['violations'] = [];
    if (maxCont > contLimit) v.push({ code: 'pausa', label: 'Pausa obrigatória não respeitada', detail: `Direção contínua de ${hh(maxCont)} (limite ${hh(contLimit)} — CTB art. 67-C)` });
    if (worked > 6 * HOUR && meal < L.meal) v.push({ code: 'refeicao', label: `Intervalo de refeição inferior a ${hh(L.meal)}`, detail: `Refeição de ${Math.round(meal / MIN)} min (CLT art. 235-C §2º)` });
    if (worked > L.base + maxExtraH * HOUR) v.push({ code: 'jornada', label: 'Jornada acima do permitido', detail: `${(worked / HOUR).toFixed(1).replace('.', ',')}h trabalhadas (${hh(L.base)} + ${maxExtraH}h extras — CLT art. 235-C)` });
    let inter: number | undefined;
    // início antes do fim da jornada anterior não é descanso curto: é marcação sobreposta (erro de registro)
    if (prevEnd !== undefined && start < prevEnd) v.push({ code: 'marcacao', label: 'Marcações sobrepostas', detail: `Início às ${new Date(start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}, antes do fim da jornada anterior: confira as marcações` });
    else if (prevEnd !== undefined) { inter = start - prevEnd; if (inter < L.inter) v.push({ code: 'interjornada', label: 'Interjornada não respeitada', detail: `Descanso de ${hh(inter)} entre jornadas (mínimo ${hh(L.inter)} — CLT art. 235-C §3º)` }); }
    out.push({ day: startOfDay(start), start, end: endM?.ts, worked, driving: drv.t, meal, wait, rest, extra, night: nightOverlap(start, end), maxCont, interjornada: inter, violations: v, open: !endM });
    prevEnd = end;
  }
  // descanso semanal: em cada semana fechada, ao menos um descanso de 35h (pode atravessar a virada da semana)
  const sorted = [...out].sort((a, b) => a.start! - b.start!);
  const gaps: [number, number][] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push([sorted[i - 1].end || sorted[i - 1].start!, sorted[i].start!]);
  if (sorted.length) gaps.push([sorted[sorted.length - 1].end || sorted[sorted.length - 1].start!, now]);
  const weeks: Record<number, DayCalc[]> = {};
  out.forEach((d) => { const dt = new Date(d.day); const monday = startOfDay(d.day - ((dt.getDay() + 6) % 7) * DAY); (weeks[monday] ||= []).push(d); });
  for (const [mon, days] of Object.entries(weeks)) {
    const m = +mon; if (m + 7 * DAY > now || m < sorted[0].day + 7 * DAY) continue; // só semanas completas com histórico anterior
    const ok = gaps.some(([a, b]) => b - a >= L.weekly && b > m && a < m + 7 * DAY);
    if (!ok) { const last = [...days].sort((a, b) => a.start! - b.start!).pop()!; last.violations.push({ code: 'semanal', label: `Descanso semanal inferior a ${hh(L.weekly)}`, detail: `Nenhum descanso de ${hh(L.weekly)} contínuas na semana (CLT art. 235-D)` }); }
  }
  return out;
}
