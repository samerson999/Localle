// BI de manutenção: visão do dono (custo) e visão do gestor (confiabilidade), cada uma contando sua história.
// Os números vêm de fetchKpis (Supabase quando ligado; senão, o mesmo cálculo sobre a simulação).
import { hadTracker } from '@localle/shared/assetStatus';
import { useEffect, useMemo, useState } from 'react';
import { useStore, useStoreData } from '../lib/store';
import { Card, Select, Table, Tabs, EmptyState, ErrorState } from './ui';
import { PeriodCompare, presetValue, periodRanges, rangeText, BI_PRESETS, type PeriodValue } from './PeriodCompare';
import { KpiTile, ChartCard, StatusDot, Num, DeltaChip, IdChip, AssetName, type LoadState } from './story';
import { StackedColumns, TipItem } from './charts';
import { fetchKpis, Kpis } from '@localle/shared/maintKpis';
import { brl, num, pct, fmtDT, hm, abbr, isPlate, monthKey, monthLabel } from '@localle/shared/utils';
import { fractionWords, listPt, maintNeeds } from '@localle/shared/insights';
import { planStatus, CRIT_DEFAULT } from '@localle/shared/maint';
import { Grid, Stack } from '../components/ui';

const rel = (a?: number | null, b?: number | null) => (a == null || b == null || !b ? null : ((a - b) / Math.abs(b)) * 100);
const diff = (a?: number | null, b?: number | null) => (a == null || b == null ? null : a - b);
export const brlShort = (v: number) => `R$ ${abbr(v)}`;

// carrega A e B para o período e o grupo escolhidos
export function useMaintKpis(period: PeriodValue, grp: string) {
  const s = useStoreData();
  const [data, setData] = useState<{ A?: Kpis; B?: Kpis; err?: string; state: LoadState }>({ state: 'loading' });
  // inclui vendidos/baixados que tiveram rastreador: o cálculo de cada período só conta quem operou nele (maintKpis)
  const assetIds = useMemo(() => s.assets.filter((a: any) => a.kind === 'veiculo' && hadTracker(s, a) && (!grp || a.groupIds.includes(grp))).map((a: any) => a.id), [s.assets, s.accessLog, grp]);
  const { a, b } = periodRanges(period);
  const key = JSON.stringify([period, assetIds, s.workOrders.length]);
  useEffect(() => {
    let alive = true; setData((d) => ({ ...d, state: 'loading' }));
    Promise.all([fetchKpis(s, a[0], a[1], assetIds), b ? fetchKpis(s, b[0], b[1], assetIds) : Promise.resolve(undefined)])
      .then(([A, B]) => alive && setData({ A, B, state: A && A.vehicles ? 'ready' : 'empty' }))
      .catch((e) => alive && setData({ err: e.message, state: 'error' }));
    return () => { alive = false; };
  }, [key]);
  return { ...data, a, b, vehicles: assetIds.length };
}

// ---------------------------------------------------------------- visão do dono: custo
export function BIDono({ A, B, a, b }: { A: Kpis; B?: Kpis; a: [number, number]; b: [number, number] | null }) {
  const cs = A.cost_total ? A.cost_corr / A.cost_total : null, csB = B && B.cost_total ? B.cost_corr / B.cost_total : null;
  const months = monthsBetween(a[0], a[1]);
  const m = (k: Kpis | undefined, key: string) => k?.monthly.find((x) => x.month === key);
  const rows = months.map((key) => ({ label: monthLabel(key), values: [Math.round(m(A, key)?.cost_prev || 0), Math.round(m(A, key)?.cost_corr || 0)] }));
  const peak = rows.reduce((best, r) => (r.values[0] + r.values[1] > best.v ? { v: r.values[0] + r.values[1], l: r.label } : best), { v: 0, l: '' });
  const byB = Object.fromEntries((B?.by_asset || []).map((x) => [x.asset_id, x]));
  const top = A.by_asset[0];
  const sentence = !A.cost_total ? 'Nenhuma OS concluída no período.'
    : `A corretiva foi ${pct(cs || 0, 0)} do custo${csB != null ? `, ${num(Math.abs(((cs || 0) - csB) * 100), 1)} p.p. ${(cs || 0) >= csB ? 'a mais' : 'a menos'} que no período anterior` : ''}; o mês mais caro foi ${peak.l} (${brlShort(peak.v)}).`;
  return (
    <Stack gap="grid">
      <Grid cols={4} equal>
        <KpiTile label="Custo de manutenção" display={<Num value={A.cost_total} prefix="R$" size="kpi" count />} delta={{ value: rel(A.cost_total, B?.cost_total), unit: '%', good: 'down' }} sub={`${A.n_prev + A.n_corr} OS executadas`} />
        <KpiTile label="Custo por km" display={<Num value={A.cost_per_km} prefix="R$" digits={2} size="kpi" count />} delta={{ value: rel(A.cost_per_km, B?.cost_per_km), unit: '%', good: 'down' }} sub={<><Num value={A.km} unit="km" size="small" /> rodados</>} />
        <KpiTile label="Corretiva no custo" value={cs != null ? cs * 100 : null} unit="%" digits={1} delta={{ value: cs != null && csB != null ? (cs - csB) * 100 : null, good: 'down' }} sub={`${brl(A.cost_corr).replace(',00', '')} em ${A.n_corr} OS corretivas`} />
        <KpiTile label="Disponibilidade" value={A.availability != null ? A.availability * 100 : null} unit="%" digits={1} delta={{ value: diff(A.availability, B?.availability) != null ? diff(A.availability, B?.availability)! * 100 : null, good: 'up' }} sub={`${num(A.downtime_h)} h paradas na oficina`} />
      </Grid>
      <ChartCard title="Preventiva × corretiva por mês" icon="grafico" period={`${rangeText(a)} · custos em R$`} sentence={sentence}
        action={top ? { label: `Ver custo de ${top.name}`, onClick: () => document.getElementById('custo-por-veiculo')?.scrollIntoView({ behavior: 'smooth' }) } : undefined}
        state={A.cost_total || (B?.cost_total ?? 0) ? 'ready' : 'empty'} empty={{ title: 'Sem custos no período', detail: 'Nenhuma OS foi concluída com custo neste período.' }}>
        <StackedColumns data={rows} series={[{ label: 'Preventiva', tone: 'real' }, { label: 'Corretiva', tone: 'loss' }]} format={(v) => abbr(v)} height={220} />
      </ChartCard>
      <Card title="Custo por veículo" icon="manutencao">
        <div id="custo-por-veiculo" className="scroll-mt-8" />
        <Table minWidth={760} head={['Veículo', 'Custo (R$)', ...(B ? ['Variação'] : []), 'Preventiva (R$)', 'Corretiva (R$)', 'Custo por km (R$)']} align={['left', 'right', ...(B ? ['right' as const] : []), 'right', 'right', 'right']} rows={A.by_asset.map((x) => [
          <AssetName name={x.name} />, <Num value={x.cost} digits={2} size="body" />,
          ...(B ? [<DeltaCell a={x.cost} b={byB[x.asset_id]?.cost} good="down" />] : []),
          <Num value={x.cost_prev} digits={2} size="body" />, <Num value={x.cost_corr} digits={2} size="body" />, x.km > 0 ? <Num value={x.cost / x.km} digits={2} size="body" /> : '—'])} />
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- visão do gestor: confiabilidade
export function BIGestor({ A, B, a, openWos }: { A: Kpis; B?: Kpis; a: [number, number]; openWos: { asset: string; title: string; since?: number }[] }) {
  const shop = openWos.filter((w) => w.since).sort((x, y) => (x.since || 0) - (y.since || 0));
  const days = (h: number | null) => (h == null ? null : h / 24);
  const fails = A.top_failures;
  const totalF = fails.reduce((s, f) => s + f.qty, 0);
  const topN = fails.slice(0, fails.length > 2 && fails[0].qty / (totalF || 1) < 0.5 ? 2 : 1);
  const failSentence = !totalF ? 'Nenhuma pane não planejada no período.' : totalF === 1 ? `Uma pane não planejada no período: ${fails[0].title.toLowerCase()}.` : `${listPt(topN.map((f) => f.title))} ${topN.length > 1 ? 'respondem' : 'responde'} por ${fractionWords(topN.reduce((s, f) => s + f.qty, 0) / totalF)} das ${totalF} panes.`;
  const maxQ = Math.max(1, ...fails.map((f) => f.qty));
  // retrato de hoje, independente do período: mesma regra do "Precisa de você"
  const s = useStoreData();
  const critNow = useMemo(() => maintNeeds(s, planStatus).filter((n) => n.level === 'crit').length, [s.plans, s.workOrders, s.vehicles]);
  return (
    <Stack gap="grid">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiTile label="Disponibilidade" value={A.availability != null ? A.availability * 100 : null} unit="%" digits={1} delta={{ value: diff(A.availability, B?.availability) != null ? diff(A.availability, B?.availability)! * 100 : null, good: 'up' }} sub={`${num(A.downtime_h)} h paradas na oficina`} />
        <KpiTile label="Tempo entre falhas (MTBF)" value={days(A.mtbf_h)} unit="dias" digits={1} delta={{ value: rel(A.mtbf_h, B?.mtbf_h), unit: '%', good: 'up' }} sub={A.failures === 1 ? '1 pane não planejada' : `${A.failures} panes não planejadas`} />
        <KpiTile label="Km entre falhas (MKBF)" value={A.mkbf} unit="km" delta={{ value: rel(A.mkbf, B?.mkbf), unit: '%', good: 'up' }} sub={<><Num value={A.km} unit="km" size="small" /> rodados</>} />
        <KpiTile label="Tempo de reparo (MTTR)" value={A.mttr_h} unit="h" digits={1} delta={{ value: diff(A.mttr_h, B?.mttr_h), unit: 'h', good: 'down' }} sub="Da entrada na oficina à liberação" />
        <KpiTile label="OS que estiveram críticas no período" value={A.overdue_critical} status={A.overdue_critical ? 'crit' : undefined} delta={{ value: diff(A.overdue_critical, B?.overdue_critical), unit: '', digits: 0, good: 'down' }} sub={`Passaram do prazo de crítico do plano (padrão ${CRIT_DEFAULT.days} dias ou ${num(CRIT_DEFAULT.km)} km), em aberto ou já executadas`} />
        <KpiTile label="OS críticas agora" value={critNow} status={critNow ? 'crit' : undefined} sub={critNow ? 'Em aberto hoje, independente do período' : 'Nenhuma OS crítica hoje'} />
        <KpiTile label="Preventivas com atraso" display={A.plan_done == null ? <Num value={null} size="kpi" count /> : <span className="flex items-baseline gap-tight"><Num value={A.late_done} size="kpi" count /><span className="text-body text-ink-2 num">de {A.plan_done}</span></span>} sub={A.late_done ? `Atraso médio de ${num(A.avg_delay_days, 1)} dias` : 'Nenhuma com atraso'} />
        <KpiTile label="Panes não planejadas" value={A.failures} delta={{ value: diff(A.failures, B?.failures), unit: '', digits: 0, good: 'down' }} />
        <KpiTile label="Na oficina agora" value={shop.length} status={shop.length ? 'parado' : undefined} sub={shop.length ? <>Mais antigo há <span className="num">{hm(Date.now() - (shop[0].since || 0))}</span></> : 'Nenhum veículo parado'} />
      </div>
      <Grid cols={2} wide>
        <ChartCard title="Falhas mais frequentes" icon="alerta" period={`${rangeText(a)} · panes não planejadas`} sentence={failSentence} state={totalF ? 'ready' : 'empty'} empty={{ title: 'Nenhuma pane no período' }}>
          <ul className="flex flex-col gap-1">
            {fails.map((f, i) => (
              <TipItem title={f.title} rows={[{ label: 'Panes', value: `${f.qty}×`, strong: true }, { label: 'Custo', value: brl(f.cost) }]} foot={totalF ? `${Math.round((f.qty / totalF) * 100)}% das panes do período` : undefined} key={f.title} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 h-9">
                <span className="text-small truncate">{f.title}</span>
                <span className="h-2.5 rounded-pill bg-track overflow-hidden"><span className="block h-full rounded-pill fill-loss grow-x" style={{ width: `${(f.qty / maxQ) * 100}%`, ['--i' as any]: i }} /></span>
                <span className="text-small num text-right whitespace-nowrap"><span className="font-semibold">{f.qty}×</span> <span className="text-ink-2">· {brlShort(f.cost)}</span></span>
              </TipItem>
            ))}
          </ul>
        </ChartCard>
        <Card title="Na oficina agora" icon="manutencao">
          {shop.length === 0 ? <EmptyState illustration="ilu-tudo-em-dia" title="Nenhum veículo na oficina" detail="A frota inteira está disponível." /> : (
            <ul className="flex flex-col">
              {shop.map((w) => (
                <li key={w.asset + w.title} className="flex items-start gap-3 py-3 border-t border-line first:border-t-0">
                  <span className="min-w-0 mr-auto flex flex-col items-start gap-1"><AssetName name={w.asset} /><span className="text-small text-ink-2">{w.title} · entrou <time className="num">{fmtDT(w.since!)}</time></span></span>
                  <StatusDot kind="parado" label={<span className="num">{hm(Date.now() - (w.since || 0))}</span>} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Grid>
      <Card title="Confiabilidade por veículo" icon="manutencao">
        <Table minWidth={760} head={['Veículo', 'Panes', 'Horas paradas', 'Km rodados', 'Km entre falhas', 'Disponibilidade']} align={['left', 'right', 'right', 'right', 'right', 'right']} rows={A.by_asset.map((x) => [
          <AssetName name={x.name} />, x.failures, <Num value={x.downtime_h} unit="h" size="body" />, <Num value={x.km} unit="km" size="body" />,
          x.failures ? <Num value={x.km / x.failures} unit="km" size="body" /> : '—', A.hours ? <Num value={(1 - x.downtime_h / A.hours) * 100} unit="%" digits={1} size="body" /> : '—'])} />
      </Card>
      <Card title="OS que estiveram críticas no período" icon="relogio">
        {A.overdue_critical == null ? <EmptyState icon="relogio" title="Sem dados de vencimento" detail="Ainda não há histórico de preventivas para calcular os vencimentos deste período." /> :
          <Table head={['OS', 'Ativo', 'Serviço', 'Vencimento', 'Crítica desde', 'Situação']} empty="Nenhuma OS passou do prazo no período." rows={A.overdue_list.map((o) => [
            o.number ? <IdChip size="sm">OS-{o.number}</IdChip> : '—', <AssetName name={o.asset} />, o.title,
            <span className="num">{[o.due_km ? `${num(+o.due_km)} km` : '', o.due_date ? new Date(o.due_date + 'T12:00').toLocaleDateString('pt-BR') : ''].filter(Boolean).join(' / ') || '—'}</span>,
            o.since ? <span className="num">{fmtDT(o.since)}</span> : '—', <StatusDot kind={o.status === 'concluida' ? 'mov' : 'crit'} label={o.status === 'concluida' ? 'Executada' : 'Em aberto'} />])} />}
      </Card>
    </Stack>
  );
}

// variação na tabela: chip pequeno (verde melhorou, rosa piorou), como na tabela com indicadores das referências
function DeltaCell({ a, b, good }: { a: number; b?: number; good: 'up' | 'down' }) {
  if (b == null || !b) return <span className="text-ink-3">—</span>;
  return <DeltaChip value={((a - b) / b) * 100} unit="%" digits={0} good={good} size="sm" />;
}

const monthsBetween = (a: number, b: number) => { const out: string[] = []; const d = new Date(a); d.setDate(1); while (d.getTime() <= b) { out.push(monthKey(d.getTime())); d.setMonth(d.getMonth() + 1); } return out; };
