export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const brl = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (v: number, d = 0) => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const km = (v: number) => num(Math.round(v ?? 0)) + ' km';
export const pct = (v: number, d = 1) => num(v * 100, d) + '%';
export const fmtDT = (t: number | string) => t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtD = (t: number | string) => t ? new Date(t).toLocaleDateString('pt-BR') : '—';
export const fmtT = (t: number) => t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
export const hm = (ms: number) => { const m = Math.round(ms / 60000); const s = m < 0 ? '-' : ''; const a = Math.abs(m); return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`; };
export const DAY = 86400000, HOUR = 3600000, MIN = 60000;
export const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const toInputDT = (t: number) => { const d = new Date(t); const z = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
export const toInputD = (t: number) => toInputDT(t).slice(0, 10);

export function haversine(a: [number, number], b: [number, number]) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export function pointInPolygon(p: [number, number], poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((xi > p[1]) !== (xj > p[1]) && p[0] < ((yj - yi) * (p[1] - xi)) / (xj - xi) + yi) inside = !inside;
  }
  return inside;
}
export function inFence(p: [number, number], f: any) {
  if (f.shape === 'circle') return haversine(p, f.center) <= f.radius;
  return f.points?.length > 2 && pointInPolygon(p, f.points);
}
export const fileToDataURL = (file: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });

export type PeriodKind = 'mes' | 'trimestre' | 'semestre' | 'ano' | 'custom';
export interface Period { kind: PeriodKind; year: number; idx: number; from?: string; to?: string }
export function periodRange(p: Period): [number, number] {
  if (p.kind === 'custom') return [new Date(p.from + 'T00:00').getTime(), new Date(p.to + 'T23:59:59').getTime()];
  const span = { mes: 1, trimestre: 3, semestre: 6, ano: 12 }[p.kind];
  const m0 = p.kind === 'ano' ? 0 : p.idx * span;
  return [new Date(p.year, m0, 1).getTime(), new Date(p.year, m0 + span, 1).getTime() - 1];
}
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export function periodLabel(p: Period) {
  if (p.kind === 'custom') return `${fmtD(p.from + 'T00:00')} a ${fmtD(p.to + 'T00:00')}`;
  if (p.kind === 'mes') return `${MESES[p.idx]}/${p.year}`;
  if (p.kind === 'trimestre') return `${p.idx + 1}º tri/${p.year}`;
  if (p.kind === 'semestre') return `${p.idx + 1}º sem/${p.year}`;
  return String(p.year);
}
export const monthKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const monthLabel = (k: string) => { const [y, m] = k.split('-'); return `${MESES[+m - 1]}/${y.slice(2)}`; };
export const sum = (a: number[]) => a.reduce((s, x) => s + (x || 0), 0);
export function groupBy<T>(a: T[], f: (x: T) => string) { return a.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {} as Record<string, T[]>); }

// placa brasileira (antiga ou Mercosul): só placas usam fonte mono no texto corrido
export const isPlate = (x: string) => /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/.test((x || '').trim());
// "20:29" se for hoje, "16/10 20:29" nos outros dias
export const shortDT = (t: number) => { const d = new Date(t); const hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === new Date().toDateString() ? hh : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hh}`; };
// número abreviado para gráficos: 18 mil, 1,2 mi
export const abbr = (v: number, d = 1) => { const a = Math.abs(v ?? 0); return a >= 1e6 ? `${num(v / 1e6, a >= 1e7 ? 0 : d)} mi` : a >= 1e3 ? `${num(v / 1e3, a >= 1e4 ? 0 : d)} mil` : num(v, 0); };