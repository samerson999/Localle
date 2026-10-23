// Vínculo motorista × veículo como HISTÓRICO (especificação em PRODUCT.md › Identificação do motorista):
// s.driverLinks = { id, assetId, driverId, start, end (null = vigente), source: escala | app | rastreador }.
// Cada origem tem a própria linha do tempo: a escala do gestor, o login no app e a leitura do iButton/RFID podem estar
// vigentes ao mesmo tempo. Vale a de maior prioridade (DRIVER_PARAMS.sourcePriority); se duas origens apontam motoristas
// diferentes no mesmo período, é um conflito para conferência (driverConflicts). A decisão final da regra é do dono.
// asset.driverId guarda o motorista efetivo atual para as telas que já o leem; eventos, viagens, jornada e
// abastecimentos gravam o motorista do momento, e trocar o vínculo não reatribui o passado.
import { useStore } from './store';
import { uid, DAY } from '@localle/shared/utils';
import { auditEntry } from '@localle/shared/audit';

export const LINK_SOURCE: Record<string, string> = { escala: 'Escala (gestor)', app: 'App do motorista', rastreador: 'Rastreador (iButton/RFID)' };
// motoristas.origem_prioridade: primeira = maior prioridade
export const DRIVER_PARAMS = { sourcePriority: ['rastreador', 'app', 'escala'] };
const rank = (src: string) => { const i = DRIVER_PARAMS.sourcePriority.indexOf(src); return i < 0 ? 99 : i; };

// base antiga sem driverLinks: o driverId de cada ativo vira um vínculo de escala vigente
function allLinks(s: any): any[] {
  if (s.driverLinks) return s.driverLinks;
  return s.assets.filter((a: any) => a.driverId).map((a: any) => ({ id: 'dl_legacy_' + a.id, assetId: a.id, driverId: a.driverId, start: Date.now() - 30 * DAY, end: null, source: 'escala' }));
}
const activeAt = (l: any, ts: number) => l.start <= ts && (!l.end || l.end > ts);

// histórico do ativo, mais recente primeiro
export const linksOf = (s: any, assetId: string) => allLinks(s).filter((l) => l.assetId === assetId).sort((a, b) => b.start - a.start);

// vínculo que vale num instante: entre os vigentes, o da origem de maior prioridade
export const effectiveLink = (links: any[], ts: number) => links.filter((l) => activeAt(l, ts)).sort((a, b) => rank(a.source) - rank(b.source) || b.start - a.start)[0];
export const driverAt = (s: any, assetId: string, ts: number) => effectiveLink(linksOf(s, assetId), ts)?.driverId || '';

export type DriverConflict = { key: string; assetId: string; from: number; to: number | null; win: any; lose: any; acked?: any };
// pares de vínculos de origens diferentes, com motoristas diferentes, que se sobrepõem no mesmo veículo
export function driverConflicts(s: any, assetId?: string): DriverConflict[] {
  const out: DriverConflict[] = [];
  const by = new Map<string, any[]>();
  for (const l of allLinks(s)) if (!assetId || l.assetId === assetId) (by.get(l.assetId) || by.set(l.assetId, []).get(l.assetId)!).push(l);
  by.forEach((ls, aid) => {
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i], b = ls[j];
      if (a.source === b.source || a.driverId === b.driverId) continue;
      const from = Math.max(a.start, b.start), to = a.end && b.end ? Math.min(a.end, b.end) : a.end || b.end || null;
      if (to != null && to <= from) continue;
      const [win, lose] = rank(a.source) <= rank(b.source) ? [a, b] : [b, a];
      const key = [a.id, b.id].sort().join('|');
      out.push({ key, assetId: aid, from, to, win, lose, acked: (s.driverConflictAcks || {})[key] });
    }
  });
  return out.sort((x, y) => y.from - x.from);
}

// registra que o motorista assumiu (ou largou, com driverId vazio) o veículo por uma origem: fecha o vínculo vigente
// da mesma origem no veículo e o do mesmo motorista, pela mesma origem, em outro veículo; recalcula o efetivo.
export function setDriver(assetId: string, driverId: string, source = 'escala', at = Date.now()) {
  useStore.getState().patch((s: any) => {
    const base = allLinks(s);
    const cur = base.find((l) => l.assetId === assetId && l.source === source && !l.end);
    if ((cur?.driverId || '') === (driverId || '')) return s.driverLinks ? {} : { driverLinks: base };
    const closing = (l: any) => !l.end && l.source === source && (l.assetId === assetId || (driverId && l.driverId === driverId));
    const touched = new Set(base.filter(closing).map((l) => l.assetId)); touched.add(assetId);
    const links = base.map((l) => (closing(l) ? { ...l, end: at } : l));
    if (driverId) links.push({ id: uid('dl'), assetId, driverId, start: at, end: null, source });
    const eff = (aid: string) => effectiveLink(links.filter((l) => l.assetId === aid), at + 1)?.driverId || '';
    const before = s.assets.find((a: any) => a.id === assetId)?.driverId || '';
    const name = (id?: string) => s.drivers.find((d: any) => d.id === id)?.name || '—';
    return {
      driverLinks: links,
      assets: s.assets.map((a: any) => (touched.has(a.id) ? { ...a, driverId: eff(a.id) } : a)),
      ...(s.session ? auditEntry(s, { coll: 'assets', refId: assetId, label: s.assets.find((a: any) => a.id === assetId)?.name || assetId, action: `registrou motorista por ${(LINK_SOURCE[source] || source).toLowerCase()}`, changes: [{ f: 'driverId', from: name(cur?.driverId), to: name(driverId) }], note: eff(assetId) !== before ? `Motorista efetivo: ${name(eff(assetId))}` : 'Motorista efetivo não mudou (vale a origem de maior prioridade vigente)' }) : {}),
    };
  });
}

export function ackConflict(c: DriverConflict, note = '') {
  useStore.getState().patch((s: any) => ({
    driverConflictAcks: { ...(s.driverConflictAcks || {}), [c.key]: { at: Date.now(), by: s.session?.name || '', note } },
    ...auditEntry(s, { coll: 'drivers', refId: c.win.driverId, label: s.assets.find((a: any) => a.id === c.assetId)?.name || c.assetId, action: 'conferiu conflito de motorista', note: `${LINK_SOURCE[c.win.source]} × ${LINK_SOURCE[c.lose.source]}${note ? ` · ${note}` : ''}` }),
  }));
}
