import { useRef } from 'react';
import { create } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { persist, type PersistStorage } from 'zustand/middleware';
import { estadoInicial } from './estadoInicial';
import { uid } from '@localle/shared/utils';
import { auditUpsert, auditRemove, auditEntry, applyAudit } from '@localle/shared/audit';

type Coll = 'groups' | 'operations' | 'drivers' | 'assets' | 'fences' | 'rules' | 'commandDefs' | 'plans' | 'workOrders' | 'fuelings' | 'fines' | 'checklistTemplates' | 'checklistResponses' | 'trips' | 'matrices' | 'gateLog' | 'journey' | 'campaigns' | 'alerts' | 'events' | 'accessLog' | 'tires' | 'odometerReadings' | 'maintRecipients';

export interface Store {
  [k: string]: any;
  session: null | { email: string; role: 'gestor' | 'revenda' | 'locale' | 'portaria'; name: string; support?: { id: string; at: number; reason: string; client: string } };
  upsert: (c: Coll, item: any) => any;
  remove: (c: Coll, id: string) => void;
  patch: (fn: (s: any) => any) => void;
  sendCommand: (cmd: { defId: string; name: string; payload: string; target: 'veiculo' | 'grupo'; assetIds: string[]; kind: string; message?: string }) => string;
  linkTracker: (assetId: string, tracker: any) => void;
}

// Chave nova: o estado salvo pela antiga simulação (rastreio-white-label-v1) é só dado fictício e é apagado.
const STORE_KEY = 'localle-v1';
try { localStorage.removeItem('rastreio-white-label-v1'); } catch { /* sem armazenamento */ }
// declarado antes da store: a mesclagem do estado salvo roda durante a criação dela
const DEFAULT_MODULES = { monitoramento: true, ativos: true, manutencao: true, combustivel: true, checklist: true, viagens: true, multas: true, jornada: true, ranking: true, pneus: true };

// Gravação no localStorage com folga: posições chegam o tempo todo pelo tempo real. Gravar (e serializar)
// a cada mudança trava a tela; grava no máximo a cada 10 s, quando o navegador está ocioso,
// e sempre ao esconder ou fechar a aba (pagehide/visibilitychange), para não perder o que foi feito.
function idleStorage<T>(delay = 10000): PersistStorage<T> {
  let pending: { name: string; value: any } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pending) return;
    const { name, value } = pending; pending = null;
    try { localStorage.setItem(name, JSON.stringify(value)); } catch { /* cota cheia ou armazenamento bloqueado */ }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }
  const ric: (cb: () => void) => void = (cb) => ((window as any).requestIdleCallback ? (window as any).requestIdleCallback(cb, { timeout: 2000 }) : cb());
  return {
    getItem: (name) => { try { const v = localStorage.getItem(name); return v ? JSON.parse(v) : null; } catch { return null; } },
    setItem: (name, value) => { pending = { name, value }; if (!timer) timer = setTimeout(() => { timer = null; ric(flush); }, delay); },
    removeItem: (name) => { pending = null; try { localStorage.removeItem(name); } catch { /* sem armazenamento */ } },
  };
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...estadoInicial(),
      maintGoals: { availability: 0.95 }, // meta de disponibilidade da frota (configurável)
      session: null,
      upsert: (c, item) => {
        const it = item.id ? item : { ...item, id: uid(c.slice(0, 2)) };
        set((s: any) => {
          const arr = s[c] as any[];
          const i = arr.findIndex((x) => x.id === it.id);
          return applyAudit(s, { [c]: i >= 0 ? arr.map((x) => (x.id === it.id ? { ...x, ...it } : x)) : [...arr, it], ...auditUpsert(s, c, arr[i], it) });
        });
        return it;
      },
      remove: (c, id) => set((s: any) => applyAudit(s, { [c]: s[c].filter((x: any) => x.id !== id), ...auditRemove(s, c, s[c].find((x: any) => x.id === id)) })),
      patch: (fn) => set((s: any) => applyAudit(s, fn(s))),
      sendCommand: ({ defId, name, payload, target, assetIds, kind, message }) => {
        const id = uid('cmd');
        const status: Record<string, string> = Object.fromEntries(assetIds.map((a) => [a, 'enviado']));
        set((s: any) => applyAudit(s, { commands: [{ id, ts: Date.now(), defId, name, payload, target, assetIds, status, message, by: s.session?.name || 'Operador' }, ...s.commands].slice(0, 300),
          // comando para grupo é operação em lote: entra no registro de alterações
          ...(target === 'grupo' && s.session ? auditEntry(s, { coll: 'commands', refId: id, label: name, action: `enviou comando para ${assetIds.length} veículos`, count: assetIds.length, note: s.assets.filter((a: any) => assetIds.includes(a.id)).map((a: any) => a.name).join(', ') }) : {}) }));
        return id;
      },
      linkTracker: (assetId, tracker) => set((s: any) => {
        const asset = s.assets.find((a: any) => a.id === assetId);
        const already = asset?.tracker?.imei === tracker.imei;
        const assets = s.assets.map((a: any) => (a.id === assetId ? { ...a, tracker: { ...tracker, linkedAt: already ? a.tracker.linkedAt : Date.now() } } : a));
        // novo vínculo encerra o vínculo anterior do mesmo veículo (troca de rastreador)
        const accessLog = already ? s.accessLog : [...s.accessLog.map((l: any) => (l.assetId === assetId && !l.unlinkedAt ? { ...l, unlinkedAt: Date.now() } : l)), { id: uid('ac'), ts: Date.now(), imei: tracker.imei, assetId, assetName: asset?.name }];
        const trackerStock = (s.trackerStock || []).filter((t: any) => t.imei !== tracker.imei);
        return { assets, accessLog, trackerStock };
      }),
    }),
    {
      name: STORE_KEY,
      storage: idleStorage(),
      // coleções novas (que o estado salvo ainda não tem) entram vazias; módulos ligados por padrão quando faltarem
      merge: (persisted: any, current: any) => ({ ...current, ...persisted, revenda: persisted?.revenda ? { ...persisted.revenda, modules: { ...DEFAULT_MODULES, ...(persisted.revenda.modules || {}) } } : current.revenda }),
      partialize: (s: any) => { const { upsert, remove, patch, sendCommand, linkTracker, ...rest } = s; return rest; },
    }
  )
);


// Estado inteiro para telas de gestão e BI, sem re-renderizar a cada posição recebida: as chaves "ao vivo"
// (posição, trilha, indicadores do dia) só disparam um novo render a cada `liveMs`; qualquer outra mudança
// (cadastro, OS, abastecimento, alerta novo) re-renderiza na hora. Telas ao vivo (mapa) usam seletores próprios.
const LIVE_KEYS = new Set(['vehicles', 'history', 'tripStats', 'ruleHits']);
export function useStoreData(liveMs = 30000): any {
  const at = useRef(Date.now());
  const s = useStoreWithEqualityFn(useStore, (x: any) => x, (a: any, b: any) => {
    if (a === b) return true;
    for (const k in b) if (a[k] !== b[k] && !LIVE_KEYS.has(k)) return false;
    return Date.now() - at.current < liveMs;
  });
  at.current = Date.now();
  return s;
}

// ---------- Seletores auxiliares ----------
// status do veículo para a interface: as cores vêm dos tokens --status-* (StatusDot/StatusGlyph), não daqui
export const vehicleStatus = (v: any) => {
  if (!v) return { key: 'sem', label: 'Sem dados' };
  if (v.noSignal || Date.now() - v.lastUpdate > 6 * 3600000) return { key: 'sem', label: 'Sem sinal' };
  if (v.moving) return { key: 'mov', label: 'Em movimento' };
  if (v.ignition) return { key: 'par', label: 'Parado ligado' };
  return { key: 'des', label: 'Desligado' };
};

export { assetKm } from '@localle/shared/km';
