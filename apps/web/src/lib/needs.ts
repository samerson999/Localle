// "Precisa de você" da sidebar: só itens CRÍTICOS de toda a plataforma (veículos, manutenção, pneus).
// NO PRODUTO REAL estas regras vão para o backend (referência: v_critical_alerts em docs/especificacao-sql/);
// o cálculo local abaixo existe só para a simulação no navegador.
import { opAssets, isOut } from '@localle/shared/assetStatus';
import { useMemo } from 'react';
import { useStoreData } from './store';
import { planStatus } from '@localle/shared/maint';
import { tireStats } from '@localle/shared/pneus';
import { useCriticalMap } from './critical';
import { maintNeeds } from '@localle/shared/insights';
import { indicationState, indicationDue, notifiedEstimated } from '@localle/shared/fines';
import { docState, docLabel, docWhen, DRIVER_DOC_PARAMS } from '@localle/shared/assetDocs';

export interface NeedItem { id: string; kind: 'os' | 'pneu' | 'veiculo' | 'multa' | 'documento'; title: string; detail?: string; since?: number; to: string }

export function useNeedsYou(): NeedItem[] {
  const s = useStoreData(10000); // km e posição contam a cada 10 s; o resto (OS, pneus, multas) na hora
  const crit = useCriticalMap();
  // veículos críticos (alerta alto sem tratamento, bloqueio pendente): valem com ou sem banco
  const vehicles = useMemo(() => [...crit.entries()].map(([aid, rs]): NeedItem => {
    const name = s.assets.find((a: any) => a.id === aid)?.name || aid;
    return { id: 'v' + aid, kind: 'veiculo', title: `Veículo crítico · ${name}`, detail: rs.length > 1 ? `${rs[0].title} e mais ${rs.length - 1}` : rs[0].title, since: Math.min(...rs.map((r) => r.since)), to: `/monitoramento?ativo=${aid}` };
  }), [crit, s.assets]);
  const rest = useMemo((): NeedItem[] => {
    const out: NeedItem[] = [];
    // manutenção: só o nível Crítico (mesma regra da tela de Manutenção, lib/insights.maintNeeds)
    if (s.revenda.modules.manutencao) for (const n of maintNeeds(s, planStatus)) if (n.level === 'crit') out.push({ id: n.id, kind: 'os', title: n.title, detail: n.context, since: n.since, to: '/manutencao' });
    if (s.revenda.modules.pneus) for (const t of s.tires || []) if (t.status === 'montado' && !isOut(s.assets.find((a: any) => a.id === t.assetId)) && tireStats(s, t).level === 'ilegal') out.push({ id: t.id, kind: 'pneu', title: `Pneu ${t.fireNumber} abaixo do mínimo legal`, detail: s.assets.find((a: any) => a.id === t.assetId)?.name, to: '/pneus' });
    // multas: indicação do condutor nos últimos dias do prazo (FINE_PARAMS.indicationCriticalDays)
    if (s.revenda.modules.multas) for (const f of s.fines || []) if (indicationState(f) === 'critica') out.push({ id: 'mu' + f.id, kind: 'multa', title: `Indicar condutor · ${s.assets.find((a: any) => a.id === f.assetId)?.name || ''}`, detail: `Prazo até ${new Date(indicationDue(f)).toLocaleDateString('pt-BR')}${notifiedEstimated(f) ? ' (estimado)' : ''} · auto ${f.auto}`, to: '/multas' });
    // documentos do ativo vencidos ou nos últimos DOC_PARAMS.criticalDays (lib/assetDocs)
    if (s.revenda.modules.ativos) for (const a of opAssets(s, false)) for (const d of a.documents || []) { const st = docState(d); if (st === 'vencido' || st === 'critico') out.push({ id: 'doc' + d.id, kind: 'documento', title: `${docLabel(d)} ${st === 'vencido' ? 'vencido' : 'vencendo'} · ${a.name}`, detail: `${docWhen(d)} (${new Date(d.due + 'T12:00').toLocaleDateString('pt-BR')})`, to: `/ativos?ativo=${a.id}` }); }
    // motoristas: CNH e exame toxicológico (C, D, E) vencidos ou nos últimos dias
    if (s.revenda.modules.ativos) for (const m of s.drivers) for (const [k, label, fem] of [['cnhDue', 'CNH', true], ['toxDue', 'Exame toxicológico', false]] as const) { if (!m[k] || (k === 'toxDue' && !/^[CDE]/.test(m.cnhCat))) continue; const d = { due: m[k] }, st = docState(d, Date.now(), DRIVER_DOC_PARAMS); if (st === 'vencido' || st === 'critico') out.push({ id: `dr${k}${m.id}`, kind: 'documento', title: `${label} ${st === 'vencido' ? (fem ? 'vencida' : 'vencido') : 'vencendo'} · ${m.name}`, detail: docWhen(d), to: '/ativos?aba=motoristas' }); }
    return out;
  }, [s.plans, s.workOrders, s.tires, s.vehicles, s.fines, s.assets, s.drivers]);
  return useMemo(() => [...vehicles, ...rest], [vehicles, rest]);
}
