import { useRef } from 'react';
import { create } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { persist, type PersistStorage } from 'zustand/middleware';
import { buildSeed, treatOld, genItems } from './seed';
import { processTick } from './engine';
import { uid } from './utils';
import { enrichFuelings, withTrackerKm } from './fuel';
import { migrateCouplings } from './couplings';
import { auditUpsert, auditRemove, auditEntry, applyAudit } from './audit';

type Coll = 'groups' | 'operations' | 'drivers' | 'assets' | 'fences' | 'rules' | 'commandDefs' | 'plans' | 'workOrders' | 'fuelings' | 'fines' | 'checklistTemplates' | 'checklistResponses' | 'trips' | 'matrices' | 'gateLog' | 'journey' | 'campaigns' | 'alerts' | 'events' | 'accessLog' | 'tires' | 'odometerReadings' | 'maintRecipients';

export interface Store {
  [k: string]: any;
  session: null | { email: string; role: 'gestor' | 'revenda' | 'locale' | 'portaria'; name: string; support?: { id: string; at: number; reason: string; client: string } };
  upsert: (c: Coll, item: any) => any;
  remove: (c: Coll, id: string) => void;
  patch: (fn: (s: any) => any) => void;
  tick: (dtReal: number) => void;
  sendCommand: (cmd: { defId: string; name: string; payload: string; target: 'veiculo' | 'grupo'; assetIds: string[]; kind: string; message?: string }) => string;
  linkTracker: (assetId: string, tracker: any) => void;
  reset: () => void;
}

const seed = () => buildSeed(Date.now());
const STORE_KEY = 'rastreio-white-label-v1';
// Gerar a base da simulação custa ~0,5 s. Com estado salvo no navegador ela só é gerada se a mesclagem abaixo
// precisar de alguma coleção que falte nos dados salvos (versões antigas); antes, rodava em toda abertura.
const hasSaved = (() => { try { const v = localStorage.getItem(STORE_KEY); return !!(v && JSON.parse(v)?.state?.assets); } catch { return false; } })();
let seeded: any = null;
// Suba SEED_REV quando a base ganhar uma coleção nova: o estado salvo sem essa marca recebe as chaves que faltam
// (uma vez, gerando a base); com a marca em dia, a abertura não gera nada.
const SEED_REV = 1;
// declarado antes da store: a mesclagem do estado salvo roda durante a criação dela
const DEFAULT_MODULES = { monitoramento: true, ativos: true, manutencao: true, combustivel: true, checklist: true, viagens: true, multas: true, jornada: true, ranking: true, pneus: true };
const seedOnce = () => (seeded ||= seed());

// Gravação no localStorage com folga: o estado tem ~1 MB e o simulador muda a cada 2 s. Gravar (e serializar)
// a cada passo travava a tela por ~15 ms; agora grava no máximo a cada 10 s, quando o navegador está ocioso,
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
      ...(hasSaved ? {} : seedOnce()),
      seedRev: SEED_REV,
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
      tick: (dtReal) => {
        const s = get();
        if (!s.simRunning) return;
        set(processTick(s, Date.now(), (dtReal / 1000) * s.simSpeed));
      },
      sendCommand: ({ defId, name, payload, target, assetIds, kind, message }) => {
        const id = uid('cmd');
        const status: Record<string, string> = Object.fromEntries(assetIds.map((a) => [a, 'enviado']));
        set((s: any) => applyAudit(s, { commands: [{ id, ts: Date.now(), defId, name, payload, target, assetIds, status, message, by: s.session?.name || 'Operador' }, ...s.commands].slice(0, 300),
          // comando para grupo é operação em lote: entra no registro de alterações
          ...(target === 'grupo' && s.session ? auditEntry(s, { coll: 'commands', refId: id, label: name, action: `enviou comando para ${assetIds.length} veículos`, count: assetIds.length, note: s.assets.filter((a: any) => assetIds.includes(a.id)).map((a: any) => a.name).join(', ') }) : {}) }));
        // veículo real: quem confirma é o próprio rastreador, via sendRealCommand (rastreioApi.ts) chamado por quem disparou o comando — aqui só simula os demais, para não criar import circular com a API real
        const assetsById: Record<string, any> = Object.fromEntries(get().assets.map((a: any) => [a.id, a]));
        assetIds.filter((aid) => !assetsById[aid]?.tracker?.live).forEach((aid, i) => {
          setTimeout(() => {
            set((s: any) => {
              const v = s.vehicles[aid];
              const ok = v && !v.noSignal;
              const vehicles = { ...s.vehicles };
              if (ok && kind === 'bloqueio') vehicles[aid] = { ...v, blocked: true };
              if (ok && kind === 'desbloqueio') vehicles[aid] = { ...v, blocked: false, stopLeft: 30 };
              return { vehicles, commands: s.commands.map((c: any) => (c.id === id ? { ...c, status: { ...c.status, [aid]: ok ? 'confirmado' : 'pendente' } } : c)) };
            });
          }, 1500 + i * 400 + Math.random() * 2000);
        });
        return id;
      },
      linkTracker: (assetId, tracker) => set((s: any) => {
        const asset = s.assets.find((a: any) => a.id === assetId);
        const already = asset?.tracker?.imei === tracker.imei;
        const assets = s.assets.map((a: any) => (a.id === assetId ? { ...a, tracker: { ...tracker, linkedAt: already ? a.tracker.linkedAt : Date.now() } } : a));
        // novo vínculo encerra o vínculo anterior do mesmo veículo (troca de rastreador)
        const accessLog = already ? s.accessLog : [...s.accessLog.map((l: any) => (l.assetId === assetId && !l.unlinkedAt ? { ...l, unlinkedAt: Date.now() } : l)), { id: uid('ac'), ts: Date.now(), imei: tracker.imei, assetId, assetName: asset?.name }];
        const trackerStock = (s.trackerStock || []).filter((t: any) => t.imei !== tracker.imei);
        const vehicles = { ...s.vehicles };
        if (!vehicles[assetId]) vehicles[assetId] = { assetId, pos: [-8.1012, -34.9386], seg: 0, speed: 0, target: 0, heading: 0, ignition: false, blocked: false, noSignal: false, stopLeft: 0, odometer: +asset?.initialKm || 0, hourmeter: 0, battery: 12.6, gps: 10, gsm: 4, lastUpdate: Date.now(), inside: [] };
        return { assets, accessLog, vehicles, trackerStock };
      }),
      // reiniciar a simulação troca os dados, mas preserva o registro de alterações (e registra o reinício)
      reset: () => set((s: any) => applyAudit(s, { ...seed(), session: s.session, ...(s.session ? auditEntry(s, { coll: 'sistema', refId: '', label: 'Simulação', action: 'reiniciou os dados da simulação' }) : {}) })),
    }),
    {
      name: STORE_KEY,
      storage: idleStorage(),
      // dados salvos de versões anteriores recebem as coleções novas (ex.: pneus) sem perder o que já existe
      // se a mesclagem falhar, o app abre com a base nova por cima dos dados salvos, em vez de ficar em branco
      merge: (persisted: any, current0: any) => { try { return mergeSaved(persisted, current0); } catch (e) { console.error('Falha ao mesclar o estado salvo', e); return { ...seedOnce(), ...current0, ...persisted, seedRev: SEED_REV }; } },
      partialize: (s: any) => { const { upsert, remove, patch, tick, sendCommand, linkTracker, reset, ...rest } = s; return rest; },
    }
  )
);

function mergeSaved(persisted: any, current0: any) {
  // `current` só gera a base quando alguma coleção do estado novo for realmente lida (getter preguiçoso)
  let full: any = null;
  const current: any = new Proxy(current0, { get: (t, k) => (k in t ? t[k] : (full ||= { ...t, ...seedOnce() })[k]), has: (t, k) => k in t || k in (full ||= { ...t, ...seedOnce() }) });
  const res: any = ({ ...current0, ...persisted, tires: persisted?.tires ?? current.tires, odometerReadings: persisted?.odometerReadings ?? [], maintRecipients: persisted?.maintRecipients ?? current.maintRecipients, escLog: persisted?.escLog ?? {}, outbox: persisted?.outbox ?? [], staff: persisted?.staff ?? current.staff, platform: persisted?.platform ?? current.platform, trackerStock: persisted?.trackerStock ?? current.trackerStock, rankCfg: persisted?.rankCfg ?? { types: {}, custom: [], limit: 100, limitPeriod: 'mes' }, respondentGroups: persisted?.respondentGroups ?? current.respondentGroups, tireCfg: persisted?.tireCfg ?? current.tireCfg, couplings: migrateCouplings(persisted?.couplings ?? []),
        // uma vez: engates viram composições e entra o bitrem da simulação (implementos, pneus e histórico)
        ...(persisted?.assets && !persisted.couplingsV2 && !persisted.assets.some((a: any) => a.id === 'a12') ? {
          assets: [...persisted.assets.map((a: any) => (a.id === 'a11' ? { ...a, trailerType: 'semirreboque' } : a)), ...current.assets.filter((a: any) => ['a12', 'a13'].includes(a.id))],
          tires: [...(persisted.tires ?? current.tires), ...current.tires.filter((x: any) => ['a12', 'a13'].includes(x.assetId))],
          couplings: [...migrateCouplings(persisted.couplings ?? []), ...current.couplings.filter((c: any) => c.tractorId === 'a2')],
        } : {}), couplingsV2: true,
        // uma vez: viagens no modelo novo (portaria, etapas, matriz recorrente e indicadores) vêm da simulação
        ...(persisted && !persisted.tripsV2 ? { trips: current.trips, matrices: current.matrices, gateLog: current.gateLog, tripStats: current.tripStats, fenceVisits: current.fenceVisits } : {}), tripsV2: true,
        // uma vez: alertas altos antigos (> 6 h) de dados salvos passam a constar como tratados pela central
        ...(persisted?.alerts && !persisted.alertsTreatV1 ? { alerts: persisted.alerts.map((a: any) => treatOld(a, Date.now())) } : {}), alertsTreatV1: true,
        // uma vez: OS antigas recebem itens (estimado × realizado) gerados como na simulação
        ...(persisted?.workOrders && !persisted.woItemsV1 ? { workOrders: persisted.workOrders.map((w: any) => (w.items ? w : { ...w, items: genItems(w, persisted.plans || current.plans) })) } : {}), woItemsV1: true,
        // uma vez: abastecimentos antigos ganham posto com localização e nota fiscal simulada
        ...(persisted?.fuelings && !persisted.fuelNfV1 ? { fuelings: enrichFuelings(persisted.fuelings), fuelGoals: { operations: { op1: 8, op2: 2.3, op3: 3 }, ...(persisted.fuelGoals || {}) } } : {}), fuelNfV1: true,
        // uma vez: abastecimentos antigos ganham o km que o rastreador marcava (para a divergência de km)
        ...(persisted?.fuelings && persisted.fuelNfV1 && !persisted.fuelKmV1 ? { fuelings: persisted.fuelings.map((f: any) => withTrackerKm(f)) } : {}), fuelKmV1: true, fuelCfg: persisted?.fuelCfg ?? { ocr: false },
        revenda: persisted?.revenda ? { ...persisted.revenda, modules: { ...DEFAULT_MODULES, ...(persisted.revenda.modules || {}) } } : current.revenda });
  return persisted?.seedRev === SEED_REV ? res : { ...seedOnce(), ...res, seedRev: SEED_REV };
}

// Estado inteiro para telas de gestão e BI, sem re-renderizar a cada passo do simulador: as chaves "ao vivo"
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

export { assetKm } from './km';
