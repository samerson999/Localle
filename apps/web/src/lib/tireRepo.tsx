// Fonte de dados do módulo de pneus (simulação no navegador). A tela usa sempre esta interface; no produto real
// as mesmas operações são funções do backend: fn_mount_tire, fn_rotate_tires… em docs/especificacao-sql/20261016120100_pneus.sql.
import { auditEntry } from '@localle/shared/audit';
import React, { createContext, useContext } from 'react';
import { useStore, useStoreData } from './store';
import { assetKm } from '@localle/shared/km';
import { tireStats, DEFAULT_TIRE_CFG, positionsFor, LAYOUTS } from '@localle/shared/pneus';
import { toast } from '../components/ui';
import { uid } from '@localle/shared/utils';

export interface TireRepo {
  remote: boolean; loading: boolean; error?: string;
  tires: any[]; stats: (t: any) => any; kmOf: (assetId: string) => number; cfg: any; minStock: Record<string, number>;
  mount: (tireId: string, assetId: string, pos: string, km: number) => Promise<void>;
  unmount: (tireId: string, km: number, dest: string, reason?: string) => Promise<void>;
  rotate: (assetId: string, a: string, b: string, km: number) => Promise<void>;
  measure: (items: { tireId: string; mm: number }[], km: number | null, source?: 'manual' | 'profundimetro') => Promise<void>;
  setLayout: (assetId: string, key: string) => Promise<boolean>;
  create: (f: any) => Promise<void>;
  sendRecap: (tireId: string) => Promise<void>;
  returnRecap: (tireId: string, r: { cost: number; supplier: string; band: string; tread: number }) => Promise<void>;
  scrap: (tireId: string, reason: string) => Promise<void>;
  setCfg: (cfg: any) => Promise<void>;
  setMinStock: (size: string, qty: number) => Promise<void>;
  reload: () => Promise<void>;
}
const Ctx = createContext<TireRepo | null>(null);
export const useTires = () => useContext(Ctx)!;

function useLocalRepo(): TireRepo {
  const s = useStoreData();
  const patchTire = (id: string, fn: (x: any) => any) => s.patch((st: any) => ({ tires: st.tires.map((x: any) => (x.id === id ? fn(x) : x)) }));
  const close = (x: any, km: number) => ({ ...x, mounts: x.mounts.map((m: any) => (!m.to ? { ...m, to: Date.now(), kmTo: km } : m)) });
  const cfg = { ...DEFAULT_TIRE_CFG, ...(s.tireCfg || {}) };
  return {
    remote: false, loading: false, tires: s.tires || [], cfg, minStock: s.tireCfg?.minStock || {},
    stats: (t) => tireStats(s, t), kmOf: (id) => assetKm(s, id), reload: async () => {},
    mount: async (tireId, assetId, pos, km) => {
      const t = s.tires.find((x: any) => x.id === tireId);
      if (t?.status !== 'estoque') return void toast('Este pneu não está em estoque.', { tone: 'crit' });
      if (s.tires.some((x: any) => x.status === 'montado' && x.assetId === assetId && x.position === pos)) return void toast('Esta posição já tem um pneu montado.', { tone: 'crit' });
      patchTire(tireId, (x) => ({ ...x, status: 'montado', assetId, position: pos, location: '', mounts: [...x.mounts, { id: uid('mt'), assetId, position: pos, life: x.lives.length, from: Date.now(), kmFrom: km }] }));
    },
    unmount: async (tireId, km, dest, reason) => patchTire(tireId, (x) => ({ ...close(x, km), status: dest, assetId: undefined, position: undefined, location: dest === 'estoque' ? 'Almoxarifado Matriz' : dest === 'recapagem' ? 'Recapadora' : '', ...(dest === 'sucata' ? { scrapDate: Date.now(), scrapReason: reason || 'Retirado do veículo' } : {}) })),
    rotate: async (assetId, a, b, km) => {
      const ta = s.tires.find((x: any) => x.status === 'montado' && x.assetId === assetId && x.position === a);
      const tb = s.tires.find((x: any) => x.status === 'montado' && x.assetId === assetId && x.position === b);
      s.patch((st: any) => ({ tires: st.tires.map((x: any) => {
        if (ta && x.id === ta.id) { const u = close(x, km); return { ...u, position: b, mounts: [...u.mounts, { id: uid('mt'), assetId, position: b, life: x.lives.length, from: Date.now() + 1, kmFrom: km }] }; }
        if (tb && x.id === tb.id) { const u = close(x, km); return { ...u, position: a, mounts: [...u.mounts, { id: uid('mt'), assetId, position: a, life: x.lives.length, from: Date.now() + 1, kmFrom: km }] }; }
        return x;
      }) }));
    },
    measure: async (items, km, source = 'manual') => { const now = Date.now(); s.patch((st: any) => ({ tires: st.tires.map((t: any) => { const it = items.find((i) => i.tireId === t.id); return it ? { ...t, measurements: [...t.measurements, { id: uid('me'), ts: now, km, mm: it.mm, life: t.lives.length, source }] } : t; }), ...(items.length > 1 ? auditEntry(st, { coll: 'tires', refId: '', label: 'Medição de sulco', action: `registrou a medição de ${items.length} pneus em lote`, count: items.length }) : {}) })); },
    // troca o tipo de eixo do veículo; recusa se algum pneu montado ficaria numa posição que deixa de existir
    setLayout: async (assetId, key) => {
      const a = s.assets.find((x: any) => x.id === assetId);
      const slots = positionsFor({ ...a, tireLayout: key }).flatMap((g) => g.slots);
      const orphan = s.tires.filter((x: any) => x.status === 'montado' && x.assetId === assetId && !slots.includes(x.position));
      if (orphan.length) { toast(`Não dá para trocar para ${LAYOUTS[key].label}.`, { tone: 'crit', detail: `Desmonte antes ${orphan.map((x: any) => x.fireNumber).join(', ')}: a posição deles não existe no novo tipo.` }); return false; }
      s.upsert('assets', { id: assetId, tireLayout: key });
      return true;
    },
    create: async (f) => { const d = f.purchasedAt; s.upsert('tires', { fireNumber: f.fire.toUpperCase(), brand: f.brand, model: f.model, size: f.size, dot: f.dot, recappable: f.recappable, maxLives: f.recappable ? f.maxLives : 1, purchaseDate: d, supplier: f.supplier, location: f.location, status: 'estoque', lives: [{ n: 1, kind: 'novo', date: d, cost: f.cost, supplier: f.supplier, tread: f.tread }], mounts: [], measurements: [] }); },
    sendRecap: async (tireId) => { const t = s.tires.find((x: any) => x.id === tireId); const st = tireStats(s, t); if (!t.recappable || st.livesLeft <= 0) return void toast('Este pneu não tem mais vidas de recapagem.', { tone: 'crit' }); patchTire(tireId, (x) => ({ ...x, status: 'recapagem', location: 'Recapadora', recapSent: [...(x.recapSent || []), Date.now()] })); },
    returnRecap: async (tireId, r) => { const t = s.tires.find((x: any) => x.id === tireId); if (t.lives.length >= t.maxLives) return void toast('Vidas esgotadas.', { tone: 'crit' }); patchTire(tireId, (x) => ({ ...x, status: 'estoque', location: 'Almoxarifado Matriz', lives: [...x.lives, { n: x.lives.length + 1, kind: 'recapagem', date: Date.now(), cost: r.cost, supplier: r.supplier, band: r.band, tread: r.tread }] })); },
    scrap: async (tireId, reason) => patchTire(tireId, (x) => ({ ...x, status: 'sucata', location: '', scrapDate: Date.now(), scrapReason: reason })),
    setCfg: async (c) => s.patch((st: any) => ({ tireCfg: { ...DEFAULT_TIRE_CFG, ...st.tireCfg, ...c } })),
    setMinStock: async (size, qty) => s.patch((st: any) => ({ tireCfg: { ...DEFAULT_TIRE_CFG, ...st.tireCfg, minStock: { ...(st.tireCfg?.minStock || {}), [size]: qty } } })),
  };
}

function LocalProvider({ children }: { children: React.ReactNode }) { const r = useLocalRepo(); return <Ctx.Provider value={r}>{children}</Ctx.Provider>; }
export function TireProvider({ children }: { children: React.ReactNode }) { return <LocalProvider>{children}</LocalProvider>; }
