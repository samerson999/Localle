import { assetKm } from './km';
import { DAY, uid, sum, groupBy } from './utils';

export const TIRE_STATUS: Record<string, { label: string; tone: string }> = {
  estoque: { label: 'Em estoque', tone: 'blue' }, montado: { label: 'Montado', tone: 'green' },
  recapagem: { label: 'Na recapadora', tone: 'orange' }, sucata: { label: 'Descartado', tone: 'gray' },
};
// Sulcos de alerta e de retirada vêm do Setup (docs/PLANO-SETUP-ADMIN.md 3.5). O mínimo legal é fixo por lei (Res. CONTRAN 558/1980).
// mark: sigla gravada no pneu junto do número (ex.: LC-1024); markLogo: logo da empresa gravado no pneu.
export const LEGAL_MIN_MM = 1.6;
export const DEFAULT_TIRE_CFG = { minLegal: LEGAL_MIN_MM, removal: 3.0, warn: 5.0, recapCost: 650, mark: 'LC', markLogo: '' };

// ---------- layout de eixos (vista de cima, frente para cima) ----------
export type AxleRole = 'direcional' | 'tracao' | 'livre' | 'carreta';
export const ROLE_LABEL: Record<AxleRole | 'estepe', string> = { direcional: 'Direcional', tracao: 'Tração', livre: 'Livre (auxiliar)', carreta: 'Carreta', estepe: 'Estepe' };
export interface Axle { label: string; role: AxleRole; left: string[]; right: string[] }
const dual = (n: number, role: AxleRole, label: string): Axle => ({ label, role, left: [`${n}EE`, `${n}EI`], right: [`${n}DI`, `${n}DE`] });
const single = (n: number, role: AxleRole, label: string): Axle => ({ label, role, left: [`${n}E`], right: [`${n}D`] });
export const LAYOUTS: Record<string, { label: string; axles: Axle[]; spares: string[] }> = {
  carro: { label: 'Carro / picape', axles: [{ label: 'Dianteiro', role: 'direcional', left: ['DE'], right: ['DD'] }, { label: 'Traseiro', role: 'tracao', left: ['TE'], right: ['TD'] }], spares: ['EST'] },
  '4x2': { label: 'Caminhão 4x2', axles: [single(1, 'direcional', 'Eixo 1 · direcional'), dual(2, 'tracao', 'Eixo 2 · tração')], spares: ['EST'] },
  '6x2': { label: 'Cavalo 6x2', axles: [single(1, 'direcional', 'Eixo 1 · direcional'), dual(2, 'tracao', 'Eixo 2 · tração'), dual(3, 'livre', 'Eixo 3 · livre')], spares: ['EST'] },
  '6x4': { label: 'Cavalo 6x4', axles: [single(1, 'direcional', 'Eixo 1 · direcional'), dual(2, 'tracao', 'Eixo 2 · tração'), dual(3, 'tracao', 'Eixo 3 · tração')], spares: ['EST'] },
  carreta: { label: 'Carreta 3 eixos', axles: [dual(1, 'carreta', 'Eixo 1'), dual(2, 'carreta', 'Eixo 2'), dual(3, 'carreta', 'Eixo 3')], spares: ['EST', 'EST2'] },
};
// tipo salvo no ativo (asset.tireLayout) ou deduzido do modelo
export function layoutKey(asset: any): string {
  if (asset?.tireLayout && LAYOUTS[asset.tireLayout]) return asset.tireLayout;
  const m = `${asset?.model || ''}`;
  if (/6x4/i.test(m)) return '6x4';
  if (/6x2|R450|FH/i.test(m)) return '6x2';
  if (/Atego|Delivery|Accelo|4x2/i.test(m)) return '4x2';
  return 'carro';
}
export const layoutOf = (asset: any) => LAYOUTS[layoutKey(asset)];
// formato em lista por eixo, usado na simulação e no modal da posição
export function positionsFor(asset: any): { axle: string; slots: string[] }[] {
  const L = layoutOf(asset);
  return [...L.axles.map((a) => ({ axle: a.label, slots: [...a.left, ...a.right] })), { axle: 'Estepe', slots: L.spares }];
}
export function posLabel(code?: string) {
  if (!code) return '—';
  if (/^EST/.test(code)) return code === 'EST' ? 'Estepe' : `Estepe ${code.slice(3)}`;
  const car: Record<string, string> = { DE: 'Dianteiro esquerdo', DD: 'Dianteiro direito', TE: 'Traseiro esquerdo', TD: 'Traseiro direito' };
  if (car[code]) return car[code];
  const m = code.match(/^(\d)([ED])([EI])?$/);
  if (!m) return code;
  return `Eixo ${m[1]} ${m[2] === 'E' ? 'esquerdo' : 'direito'}${m[3] ? (m[3] === 'E' ? ' externo' : ' interno') : ''}`;
}
export function roleOf(asset: any, code?: string): AxleRole | 'estepe' {
  if (!code || /^EST/.test(code)) return 'estepe';
  return layoutOf(asset).axles.find((a) => a.left.includes(code) || a.right.includes(code))?.role || 'livre';
}
export const lifeLabel = (n: number) => (n <= 1 ? 'Novo' : `${n - 1}ª recapagem`);

// ---------- Cálculos (fonte única; espelhados em docs/especificacao-sql como views SQL) ----------
export function tireKm(s: any, t: any, life?: number) {
  return sum((t.mounts || []).filter((m: any) => life === undefined || m.life === life).map((m: any) => Math.max(0, (m.kmTo ?? assetKm(s, m.assetId)) - m.kmFrom)));
}
export function tireStats(s: any, t: any) {
  const cfg = { ...DEFAULT_TIRE_CFG, ...(s.tireCfg || {}), minLegal: LEGAL_MIN_MM };
  const life = t.lives[t.lives.length - 1];
  const lifeNo = t.lives.length;
  const meas = (t.measurements || []).filter((m: any) => m.life === lifeNo).sort((a: any, b: any) => a.ts - b.ts);
  const last = meas[meas.length - 1];
  const tread = last ? last.mm : life.tread;
  const usable = Math.max(0.1, life.tread - cfg.removal);
  const wear = Math.min(1, Math.max(0, (life.tread - tread) / usable));
  const kmAll = tireKm(s, t);
  const kmLife = tireKm(s, t, lifeNo);
  const cost = sum(t.lives.map((l: any) => l.cost));
  // taxa de desgaste (mm por 1.000 km) na vida atual
  const withKm = meas.filter((m: any) => m.km);
  let rate = 0;
  if (withKm.length >= 2) { const a = withKm[0], b = withKm[withKm.length - 1]; if (b.km > a.km) rate = (a.mm - b.mm) / ((b.km - a.km) / 1000); }
  else if (kmLife > 500 && tread < life.tread) rate = (life.tread - tread) / (kmLife / 1000);
  const kmLeft = rate > 0 ? Math.max(0, ((tread - cfg.removal) / rate) * 1000) : null;
  // km previstos na vida atual (do sulco inicial até a retirada) e custo por km da vida
  const kmLifeProj = rate > 0 ? (usable / rate) * 1000 : null;
  const livesLeft = Math.max(0, t.maxLives - lifeNo);
  const level = tread <= cfg.minLegal ? 'ilegal' : tread <= cfg.removal ? 'retirar' : tread <= cfg.warn ? 'atencao' : 'ok';
  const projectedCost = cost + livesLeft * cfg.recapCost;
  return { lifeNo, life, tread, wear, kmAll, kmLife, cost, cpk: kmAll > 0 ? cost / kmAll : 0, rate, kmLeft, kmLifeProj, lifeCpk: kmLifeProj ? life.cost / kmLifeProj : 0, livesLeft, level, lastMeasure: last, projectedCost, cfg };
}
// status como ponto + texto (cores dos tokens --status-*)
export const LEVEL: Record<string, { label: string; kind: 'mov' | 'parado' | 'crit' }> = {
  ok: { label: 'Sulco bom', kind: 'mov' }, atencao: { label: 'Atenção', kind: 'parado' },
  retirar: { label: 'Retirar', kind: 'crit' }, ilegal: { label: 'Abaixo do mínimo legal', kind: 'crit' },
};

// ---------- movimentações (montagem, rodízio, retirada, recapagem, descarte) ----------
export type MoveKind = 'compra' | 'montagem' | 'rodizio' | 'retirada' | 'envio_recapagem' | 'recapagem' | 'descarte';
export const MOVE_LABEL: Record<MoveKind, string> = { compra: 'Compra', montagem: 'Montagem', rodizio: 'Rodízio', retirada: 'Retirada', envio_recapagem: 'Enviado à recapadora', recapagem: 'Recapagem', descarte: 'Descarte' };
// derivado dos registros do pneu: um rodízio é uma desmontagem seguida de montagem no mesmo veículo no mesmo instante
export function movesOf(t: any) {
  const out: { ts: number; kind: MoveKind; assetId?: string; pos?: string; fromPos?: string; km?: number; detail?: string }[] = [];
  t.lives.forEach((l: any) => out.push(l.n === 1 ? { ts: l.date, kind: 'compra', detail: l.supplier } : { ts: l.date, kind: 'recapagem', detail: [lifeLabel(l.n), l.supplier, l.band].filter(Boolean).join(' · ') }));
  const ms = [...(t.mounts || [])].sort((a: any, b: any) => a.from - b.from);
  ms.forEach((m: any, i: number) => {
    const prev = ms[i - 1], next = ms[i + 1];
    const rot = prev && prev.to && prev.assetId === m.assetId && Math.abs(m.from - prev.to) < 60000;
    out.push(rot ? { ts: m.from, kind: 'rodizio', assetId: m.assetId, pos: m.position, fromPos: prev.position, km: m.kmFrom } : { ts: m.from, kind: 'montagem', assetId: m.assetId, pos: m.position, km: m.kmFrom });
    const rotNext = next && m.to && next.assetId === m.assetId && Math.abs(next.from - m.to) < 60000;
    if (m.to && !rotNext) out.push({ ts: m.to, kind: 'retirada', assetId: m.assetId, pos: m.position, km: m.kmTo, detail: m.kmTo != null ? `rodou ${Math.round(m.kmTo - m.kmFrom).toLocaleString('pt-BR')} km` : undefined });
  });
  (t.recapSent || []).forEach((ts: number) => out.push({ ts, kind: 'envio_recapagem' }));
  if (t.scrapDate) out.push({ ts: t.scrapDate, kind: 'descarte', detail: t.scrapReason });
  return out.sort((a, b) => b.ts - a.ts);
}

// ---------- desgaste e custo por posição e por marca ----------
// Usa a vida atual de cada pneu com taxa de desgaste medida: mm por 1.000 km, km previstos na vida e R$ por 1.000 km.
export function wearBy(rows: { t: any; st: any; key: string }[]) {
  return Object.entries(groupBy(rows.filter((r) => r.st.rate > 0), (r: any) => r.key)).map(([key, arr]: any) => {
    const rate = sum(arr.map((r: any) => r.st.rate)) / arr.length;
    const km = sum(arr.map((r: any) => r.st.kmLifeProj || 0)) / arr.length;
    const cpk = sum(arr.map((r: any) => r.st.lifeCpk)) / arr.length;
    return { key, n: arr.length, rate, km, cpk };
  }).sort((a, b) => a.cpk - b.cpk);
}

