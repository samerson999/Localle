// Fonte de dados do módulo de pneus. Pneus e movimentações vivem na API (apps/api/src/pneus): cada ação grava lá e
// recarrega `tires` (syncPneus), que a tela lê no formato de packages/shared/pneus. Ficam no navegador só a
// identificação gravada no pneu (sigla/logo) e o estoque mínimo por medida — preferências da tela, sem endpoint ainda.
import React, { createContext, useContext } from 'react';
import { useStoreData } from './store';
import { assetKm } from '@localle/shared/km';
import { tireStats, DEFAULT_TIRE_CFG, positionsFor, LAYOUTS } from '@localle/shared/pneus';
import { toast } from '../components/ui';
import { cadastrarPneu, movimentarPneus, salvarFichaAtivo, syncPneus } from './localleApi';

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

// Erro da API vira aviso e é relançado: a tela não mostra o "salvo" que vem depois do await nem fecha o formulário.
async function gravar(o: () => Promise<unknown>, falha: string) {
  try { await o(); } catch (e: any) { toast(`${falha}: ${e?.message || e}`, { tone: 'crit' }); throw e; }
}

function useApiRepo(): TireRepo {
  const s = useStoreData();
  const cfg = { ...DEFAULT_TIRE_CFG, ...(s.tireCfg || {}) };
  const mov = (tireId: string, tipo: string, extra: Record<string, unknown> = {}) => ({ id: tireId, tipo, ...extra });
  return {
    remote: true, loading: false, tires: s.tires || [], cfg, minStock: s.tireCfg?.minStock || {},
    stats: (t) => tireStats(s, t), kmOf: (id) => assetKm(s, id), reload: () => syncPneus(),
    mount: (tireId, assetId, pos, km) => gravar(() => movimentarPneus([mov(tireId, 'montagem', { assetId, posicao: pos, kmVeiculo: km })]), 'Pneu não montado'),
    unmount: (tireId, km, dest, reason) => gravar(() => movimentarPneus([
      mov(tireId, 'retirada', { kmVeiculo: km }),
      ...(dest === 'recapagem' ? [mov(tireId, 'envio_recapagem')] : dest === 'sucata' ? [mov(tireId, 'descarte', { obs: reason || 'Retirado do veículo' })] : []),
    ]), 'Retirada não gravada'),
    // troca as duas posições numa transação só; se uma delas estiver vazia, é um rodízio simples
    rotate: (assetId, a, b, km) => {
      const em = (pos: string) => (s.tires || []).find((x: any) => x.status === 'montado' && x.assetId === assetId && x.position === pos);
      const ta = em(a), tb = em(b);
      const m = ta ? mov(ta.id, 'rodizio', { posicao: b, kmVeiculo: km, troca: !!tb }) : tb ? mov(tb.id, 'rodizio', { posicao: a, kmVeiculo: km }) : null;
      return m ? gravar(() => movimentarPneus([m]), 'Rodízio não gravado') : Promise.resolve();
    },
    measure: (items, km, source = 'manual') => gravar(() => movimentarPneus(items.map((i) => mov(i.tireId, 'medicao', { sulcoMm: i.mm, kmVeiculo: km, dados: { fonte: source } }))), 'Medição não gravada'),
    // troca o tipo de eixo do veículo; recusa se algum pneu montado ficaria numa posição que deixa de existir
    setLayout: async (assetId, key) => {
      const a = s.assets.find((x: any) => x.id === assetId);
      const slots = positionsFor({ ...a, tireLayout: key }).flatMap((g) => g.slots);
      const orphan = s.tires.filter((x: any) => x.status === 'montado' && x.assetId === assetId && !slots.includes(x.position));
      if (orphan.length) { toast(`Não dá para trocar para ${LAYOUTS[key].label}.`, { tone: 'crit', detail: `Desmonte antes ${orphan.map((x: any) => x.fireNumber).join(', ')}: a posição deles não existe no novo tipo.` }); return false; }
      s.upsert('assets', { id: assetId, tireLayout: key });
      // o tipo de eixo é do ativo (ficha na API)
      salvarFichaAtivo(assetId).catch((e: any) => toast('Tipo de eixo não gravado: ' + (e.message || e), { tone: 'crit' }));
      return true;
    },
    create: (f) => gravar(() => cadastrarPneu(f), 'Pneu não cadastrado'),
    sendRecap: (tireId) => gravar(() => movimentarPneus([mov(tireId, 'envio_recapagem')]), 'Envio à recapadora não gravado'),
    returnRecap: (tireId, r) => gravar(() => movimentarPneus([mov(tireId, 'recapagem', { sulcoMm: r.tread, custo: r.cost, dados: { ...(r.supplier ? { fornecedor: r.supplier } : {}), ...(r.band ? { banda: r.band } : {}) } })]), 'Volta da recapagem não gravada'),
    scrap: (tireId, reason) => gravar(() => movimentarPneus([mov(tireId, 'descarte', { obs: reason })]), 'Descarte não gravado'),
    setCfg: async (c) => s.patch((st: any) => ({ tireCfg: { ...DEFAULT_TIRE_CFG, ...st.tireCfg, ...c } })),
    setMinStock: async (size, qty) => s.patch((st: any) => ({ tireCfg: { ...DEFAULT_TIRE_CFG, ...st.tireCfg, minStock: { ...(st.tireCfg?.minStock || {}), [size]: qty } } })),
  };
}

export function TireProvider({ children }: { children: React.ReactNode }) { const r = useApiRepo(); return <Ctx.Provider value={r}>{children}</Ctx.Provider>; }
