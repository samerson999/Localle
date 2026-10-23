import { RetiredToggle } from '../components/RetiredToggle';
import { opAssets } from '../lib/assetLifecycle';
import { auditEntry } from '@localle/shared/audit';
import { useEffect, useMemo, useState } from 'react';
import { useStore, assetKm, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Check, Badge, Tabs, Modal, PageHeader, Textarea, FilePick, EmptyState, ErrorState, Skeleton, Panel, InlineInput, cx, TextButton, toast, confirmAction, Grid, Stack, FormGroup, IconButton } from '../components/ui';
import { planStatus, generateDueOrders, SERVICES, OS_STATUS, CRIT_DEFAULT } from '@localle/shared/maint';
import { brl, fmtD, fmtDT, num, HOUR, uid, isPlate, sum } from '@localle/shared/utils';
import { BIDono, BIGestor, useMaintKpis } from '../components/BIManut';
import { PeriodCompare, presetValue, periodRanges, BI_PRESETS, type PeriodValue } from '../components/PeriodCompare';
import { KpiHero, KpiTile, ChartCard, NeedsList, PatternCard, Timeline, StatusDot, Num, DeltaChip, Plate, IdChip, AssetName } from '../components/story';
import { RankBars, ColumnChart, EstVsReal, ChartLegend } from '../components/charts';
import { Icon } from '../components/icons';
import { Dropzone } from '../components/Dropzone';
import { ESC_LEVELS, type EscLevel, type Recipient, type OutMail } from '@localle/shared/escalation';
import { runMaintJobs } from '../lib/maintJobs';
import { availability, availabilityWeeks, waterfallSentence, weeksSentence, findPatterns, maintNeeds, orderTimeline, orderResult } from '@localle/shared/insights';

export default function Manutencao() { return <ManutencaoLocal />; }

const TABS = [{ key: 'geral', label: 'Visão geral' }, { key: 'preventivas', label: 'Preventivas' }, { key: 'os', label: 'Ordens de serviço' }, { key: 'planos', label: 'Planos' }, { key: 'emails', label: 'Alertas e e-mails' }, { key: 'dono', label: 'BI do dono' }, { key: 'gestor', label: 'BI do gestor' }];
const BI_TABS = ['geral', 'dono', 'gestor'];

function ManutencaoLocal() {
  const s = useStoreData();
  const [tab, setTab] = useState('geral');
  const [os, setOs] = useState<any>(null);
  const [period, setPeriod] = useState<PeriodValue>(() => presetValue(BI_PRESETS[2], 'anterior'));
  const [grp, setGrp] = useState('');
  useEffect(() => { const st = useStore.getState(); const add = generateDueOrders(st); if (add.length) st.patch((x: any) => ({ workOrders: [...x.workOrders, ...add], ...auditEntry({ session: { name: 'Sistema' } }, { coll: 'workOrders', refId: '', label: 'Preventivas vencidas', action: `gerou ${add.length} OS preventivas automaticamente`, count: add.length, note: add.map((o: any) => o.title).join(', ') }) })); }, []);
  const isBI = BI_TABS.includes(tab);
  const openWos = s.workOrders.filter((w: any) => !['concluida', 'cancelada'].includes(w.status) && w.shopInAt).map((w: any) => ({ asset: s.assets.find((a: any) => a.id === w.assetId)?.name, title: w.title, since: w.shopInAt }));
  return (
    <div>
      <PageHeader icon="manutencao" title="Manutenção" subtitle="Disponibilidade da frota, preventivas, ordens de serviço e custos" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head">
        <RetiredToggle />
        <Tabs value={tab} onChange={setTab} tabs={TABS} />
        <Button className="ml-auto" onClick={() => setOs({ isNew: true })}><Icon name="mais" size={18} />Nova OS</Button>
        {(tab === 'dono' || tab === 'gestor') && <div className="w-44"><Select aria-label="Grupo" value={grp} onChange={(e) => setGrp(e.target.value)} options={[{ value: '', label: 'Frota inteira' }, ...s.groups.map((g: any) => ({ value: g.id, label: g.name }))]} /></div>}
        {isBI && <PeriodCompare value={period} onChange={setPeriod} />}
      </div>
      {tab === 'geral' && <VisaoGeral period={period} openOs={setOs} goTab={setTab} />}
      {tab === 'preventivas' && <Preventivas openOs={setOs} />}
      {tab === 'os' && <OsList openOs={setOs} />}
      {tab === 'planos' && <Planos />}
      {tab === 'emails' && <Escalonamento />}
      {(tab === 'dono' || tab === 'gestor') && <BITab view={tab} period={period} grp={grp} openWos={openWos} />}
      {os && <OsModal init={os} onClose={() => setOs(null)} />}
    </div>
  );
}

function BITab({ view, period, grp, openWos }: any) {
  const k = useMaintKpis(period, grp);
  if (k.state === 'error') return <Card><ErrorState illustration="ilu-erro" layout="row" title="Não foi possível calcular os indicadores" detail={k.err} /></Card>;
  if (!k.A) return <Card><div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div></Card>;
  return view === 'dono' ? <BIDono A={k.A} B={k.B} a={k.a} b={k.b} /> : <BIGestor A={k.A} B={k.B} a={k.a} openWos={openWos} />;
}

// rótulos curtos das causas de indisponibilidade só para o RankBars (coluna de rótulo com largura fixa em charts.tsx)
const SHORT_CAUSE: Record<string, string> = { espera: 'Orçamento ou peça', pane: 'Pane', corretiva: 'Corretiva programada', preventiva: 'Preventiva' };

// ---------------------------------------------------------------- visão geral: número → por quê → onde agir
function VisaoGeral({ period, openOs, goTab }: { period: PeriodValue; openOs: (w: any) => void; goTab: (t: string) => void }) {
  const s = useStoreData();
  const goal = s.maintGoals?.availability ?? 0.95;
  const { a, b } = periodRanges(period);
  const d = useMemo(() => {
    const cur = availability(s, a[0], a[1]), prev = b ? availability(s, b[0], b[1]) : null;
    return { cur, prev, weeks: availabilityWeeks(s, 12), needs: maintNeeds(s, planStatus), patterns: findPatterns(s).filter((p) => p.action.to === '/manutencao' || p.label === 'Custo concentrado') };
  }, [s.workOrders, s.plans, s.assets, JSON.stringify(period)]);
  const curPct = d.cur.value == null ? null : d.cur.value * 100;
  const prevPct = d.prev?.value == null ? null : d.prev.value * 100;
  const scaleMin = Math.max(0, Math.floor(Math.min(curPct ?? 100, goal * 100) - 2));

  const espera = s.workOrders.filter((w: any) => ['aberta', 'orcamento', 'aprovada'].includes(w.status) && w.shopInAt);
  const below = d.cur.value != null && d.cur.value < goal;
  const woById = (id?: string) => s.workOrders.find((w: any) => w.id === id);
  return (
    <Stack gap="grid">
      <Grid split="5/7" equal>
        <KpiHero title="Disponibilidade da frota" value={curPct} unit="%" digits={1}
          delta={{ value: curPct != null && prevPct != null ? curPct - prevPct : null }}
          goal={{ value: goal * 100, label: `Meta ${num(goal * 100, goal * 100 % 1 ? 1 : 0)}%` }} scale={[scaleMin, 100]}
          rows={[
            { label: 'Horas paradas na oficina', value: <Num value={d.cur.downHours} unit="h" size="body" />, delta: d.prev ? { value: d.cur.downHours - d.prev.downHours, unit: 'h', digits: 0, good: 'down' } : undefined },
            { label: 'Custo corretivo', value: brl(d.cur.costCorr) },
          ]} />
        <ChartCard title={below ? 'Por que está abaixo da meta' : 'Para onde foi o tempo da frota'} sentence={waterfallSentence(d.cur.causes)}
          action={espera.length ? { label: `Revisar ${espera.length} OS em espera`, onClick: () => goTab('os') } : { label: 'Ver ordens de serviço', onClick: () => goTab('os') }}
          state={d.cur.causes.length ? 'ready' : 'empty'} empty={{ title: 'Nenhuma parada na oficina', detail: 'Neste período nenhum veículo ficou parado em manutenção.' }}>
          <div className="pt-6">
            <RankBars items={d.cur.causes.map((c) => ({ label: SHORT_CAUSE[c.key] || c.label, value: c.hours }))}
              format={(v) => { const c = d.cur.causes.find((x) => Math.abs(x.hours - v) < 1e-6); return `${num(v)} h · ${c ? num(c.pts, 1) : '—'} p.p.`; }} />
          </div>
        </ChartCard>
      </Grid>
      <Grid split="7/5" equal>
        <ChartCard title="Últimas 12 semanas" icon="grafico" sentence={weeksSentence(d.weeks, goal)}>
          <div className="flex-1 min-h-0 flex flex-col justify-center">
            <ColumnChart data={d.weeks.map((w) => ({ label: w.label, value: w.value * 100 }))} goal={{ value: goal * 100, label: `Meta ${num(goal * 100, goal * 100 % 1 ? 1 : 0)}%` }} format={(v) => `${num(v, 1)}%`} height={260} label="Disponibilidade semanal" good="up" showValues={false} floor={Math.max(0, Math.floor(Math.min(...d.weeks.map((w) => w.value * 100), goal * 100) - 2))} />
          </div>
        </ChartCard>
        <Stack gap="grid">
        <Card title="Precisa de você" icon="atencao">
          {d.needs.length === 0 ? <EmptyState illustration="ilu-tudo-em-dia" title="Nenhuma OS em Crítico ou Alerta" detail="As preventivas estão dentro do prazo." /> : (['crit', 'alerta'] as const).map((lv) => {
            const list = d.needs.filter((n) => n.level === lv);
            if (!list.length) return null;
            return (
              <div key={lv} className="mt-4 first:mt-0">
                <h3 className="text-caption text-ink-2 flex items-center gap-tight mb-1"><StatusDot kind={lv === 'crit' ? 'crit' : 'parado'} label={lv === 'crit' ? 'Crítico' : 'Alerta'} className="text-caption text-ink-2" /><span className="num text-ink-3">{list.length}</span></h3>
                <NeedsList items={list.slice(0, lv === 'crit' ? 6 : 4).map((n) => ({ id: n.id, icon: 'manutencao', tone: lv === 'crit' ? 'crit' : undefined, title: n.title, context: n.context, onClick: () => (n.woId ? openOs(woById(n.woId)) : goTab('preventivas')) }))} />
                {list.length > (lv === 'crit' ? 6 : 4) && <Button variant="link" size="sm" onClick={() => goTab('preventivas')}>Ver as {list.length}</Button>}
              </div>
            );
          })}
        </Card>
        {d.patterns.length > 0 && <PatternCard items={d.patterns.map((p) => ({ ...p, action: p.action.to === '/manutencao' ? { label: p.action.label, onClick: () => goTab('os') } : p.action }))} />}
        </Stack>
      </Grid>
    </Stack>
  );
}

// ---------------------------------------------------------------- preventivas
const PLAN_ST: Record<string, { label: string; tone: string }> = { vencida: { label: 'Vencida', tone: 'red' }, proxima: { label: 'Próxima', tone: 'orange' }, os_aberta: { label: 'OS aberta', tone: 'tag' }, em_dia: { label: 'Em dia', tone: 'green' }, sem_historico: { label: 'Sem histórico', tone: 'gray' } };

function Preventivas({ openOs }: any) {
  const s = useStoreData();
  const rows = s.plans.flatMap((p: any) => p.assetIds.map((aid: string) => ({ p, ...planStatus(s, p, aid) })));
  const c = (k: string) => rows.filter((r: any) => r.status === k).length;
  const u = (r: any) => (r.hours ? 'h' : 'km');
  return (
    <Stack gap="grid">
      <Grid cols={4} equal>
        <KpiTile label="Vencidas" value={c('vencida')} status={c('vencida') ? 'crit' : undefined} />
        <KpiTile label="Próximas" value={c('proxima')} status={c('proxima') ? 'parado' : undefined} />
        <KpiTile label="Com OS aberta" value={c('os_aberta')} />
        <KpiTile label="Em dia" value={c('em_dia')} />
      </Grid>
      <Card title="Situação dos planos por ativo">
        <p className="text-small text-ink-2 mb-4 max-w-[80ch]">A próxima preventiva é calculada a partir da última OS concluída com o mesmo serviço, preventiva ou corretiva. Uma corretiva que antecipa o serviço recalcula o plano.</p>
        <Table minWidth={960} head={['Ativo', 'Plano', 'Última execução', 'Atual', 'Próxima', 'Faltam', 'Situação', '']} rows={rows.map((r: any) => [
          <AssetName name={r.asset?.name} />, r.p.name,
          r.last ? <span><Num value={r.lastKm || null} unit={u(r)} size="body" /> <span className="text-ink-2">· {fmtD(r.last.releasedAt)}</span>{r.recalculated && <span className="block text-caption text-ink-2">Recalculado pela OS #{r.last.num} (corretiva)</span>}</span> : '—',
          <Num value={r.cur} unit={u(r)} size="body" />,
          r.status === 'sem_historico' ? '—' : <span className="whitespace-nowrap">{[r.nextKm !== null && `${num(r.nextKm)} ${u(r)}`, r.nextDate && fmtD(r.nextDate)].filter(Boolean).join(' ou ')}</span>,
          <span className={cx('num whitespace-nowrap', ((r.leftKm ?? 1) < 0 || (r.leftDays ?? 1) < 0) && 'text-loss-ink')}>{[r.leftKm !== null && `${num(r.leftKm)} ${u(r)}`, r.leftDays !== null && `${r.leftDays} dias`].filter(Boolean).join(' / ')}</span>,
          r.status === 'vencida' ? <StatusDot kind={r.level === 'crit' ? 'crit' : 'parado'} label={r.level === 'crit' ? 'Vencida · crítica' : 'Vencida · alerta'} /> : <Badge tone={PLAN_ST[r.status].tone}>{PLAN_ST[r.status].label}</Badge>,
          r.open ? <Button variant="link" size="sm" onClick={() => openOs(r.open)}>Abrir OS #{r.open.num}</Button> : null])} />
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- ordens de serviço
function OsList({ openOs }: any) {
  const wos = useStore((s) => s.workOrders);
  const assets = useStore((s) => s.assets);
  const [st, setSt] = useState('abertas');
  const [type, setType] = useState('');
  const list = [...wos].filter((w: any) => (st === 'todas' || (st === 'abertas' ? !['concluida', 'cancelada'].includes(w.status) : w.status === st)) && (!type || w.type === type)).sort((a: any, b: any) => b.openedAt - a.openedAt);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Tabs value={st} onChange={setSt} tabs={[{ key: 'abertas', label: 'Em andamento' }, { key: 'concluida', label: 'Concluídas' }, { key: 'todas', label: 'Todas' }]} />
        <Tabs value={type} onChange={setType} tabs={[{ key: '', label: 'Todos os tipos' }, { key: 'preventiva', label: 'Preventiva' }, { key: 'corretiva', label: 'Corretiva' }]} />
        <span className="ml-auto text-small text-ink-2 num">{list.length} OS</span>
      </div>
      <Table minWidth={860} emptyState={<EmptyState illustration="ilu-manutencao" layout="row" title="Nenhuma OS com esses filtros" detail="Troque a situação ou o tipo, ou abra uma nova OS." />} align={['left', 'left', 'left', 'left', 'left', 'left', 'right']} onRow={(i) => openOs(list[i])} head={['OS', 'Ativo', 'Serviço', 'Tipo', 'Abertura', 'Status', 'Custo']} rows={list.map((w: any) => {
        const name = assets.find((a: any) => a.id === w.assetId)?.name;
        return [
          <button type="button" aria-label={`Abrir OS ${w.num}`} onClick={(e) => { e.stopPropagation(); openOs(w); }} className="rounded-chip hover:ring-1 hover:ring-line-hover"><IdChip size="sm">OS-{w.num}</IdChip></button>,
          <AssetName name={name} />, w.title,
          <span className="text-ink-2">{w.type === 'corretiva' ? (w.unplanned ? 'Corretiva · pane' : 'Corretiva') : 'Preventiva'}</span>,
          <span className="num">{fmtD(w.openedAt)}</span>, <Badge tone={OS_STATUS[w.status].tone}>{OS_STATUS[w.status].label}</Badge>, w.cost ? brl(w.cost) : <span className="text-ink-3">—</span>];
      })} />
    </Card>
  );
}

// ---------------------------------------------------------------- detalhe da OS
function OsModal({ init, onClose }: any) {
  const s = useStoreData();
  const [w, setW] = useState<any>(() => init.isNew
    ? { type: 'corretiva', assetId: opAssets(s)[0]?.id, services: [], items: [], title: '', description: '', status: 'aberta', unplanned: true, openedAt: Date.now(), odometerAt: 0, quotes: [], evidences: [], comments: [], nf: { chave: '', numero: '', valor: 0, erp: 'nenhum' } }
    : { items: [], ...JSON.parse(JSON.stringify(init)) });
  const [comment, setComment] = useState('');
  const [newItem, setNewItem] = useState('');
  const set = (k: string, v: any) => setW((cur: any) => ({ ...cur, [k]: v }));
  const save = (extra: any = {}) => { const n = { ...w, ...extra }; if (!n.id) n.num = Math.max(1000, ...s.workOrders.map((x: any) => x.num || 0)) + 1; const r = s.upsert('workOrders', n); setW({ ...n, id: r.id }); return r; };
  const winner = w.quotes.find((q: any) => q.id === w.winnerId);
  const si = ['aberta', 'orcamento', 'aprovada', 'execucao', 'concluida'].indexOf(w.status);
  const user = s.session?.name || 'Gestor';
  const asset = s.assets.find((a: any) => a.id === w.assetId);
  const res = orderResult(w);
  const tl = orderTimeline(w);
  const items = w.items || [];
  const upItem = (id: string, k: string, v: any) => set('items', items.map((x: any) => (x.id === id ? { ...x, [k]: v } : x)));
  const evItems = items.filter((i: any) => i.est != null || i.real != null).map((i: any) => ({ key: i.id, label: i.label, est: i.est || 0, real: i.real ?? (w.status === 'concluida' ? 0 : i.est || 0) }));
  const doneN = items.filter((i: any) => i.done).length;
  const shopH = w.shopInAt ? ((w.releasedAt || Date.now()) - w.shopInAt) / HOUR : null;

  const resultText = w.status === 'concluida'
    ? <>Liberada após <span className="num">{num(shopH ?? 0)} h</span> parada · {brl(res.real || 0)}{res.over != null && <> · {Math.abs(res.over) < 1 ? 'no orçamento' : <span className={res.over > 0 ? 'text-loss-ink' : ''}>{res.over > 0 ? '+' : '−'}{brl(Math.abs(res.over))} {res.over > 0 ? 'acima' : 'abaixo'} do estimado</span>}</>}</>
    : w.status === 'cancelada' ? 'OS cancelada.'
    : <>{OS_STATUS[w.status].label}{shopH != null && <> · veículo parado há <span className="num">{num(shopH)} h</span></>}{res.est != null && <> · estimado {brl(res.est)}</>}</>;

  return (
    <Modal open onClose={onClose} title={w.id ? `OS #${w.num} · ${w.title || 'sem título'}` : 'Nova ordem de serviço'} width="max-w-6xl"
      footer={<>{w.id && w.status !== 'cancelada' && w.status !== 'concluida' && <TextButton tone="danger" className="mr-auto" onClick={async () => { if (await confirmAction({ title: `Cancelar a OS #${w.num}?`, detail: 'A OS sai da lista em andamento. Orçamentos e comentários ficam registrados.' })) { save({ status: 'cancelada' }); onClose(); } }}>Cancelar OS</TextButton>}<Button variant="ghost" onClick={onClose}>Fechar</Button><Button onClick={() => { save(); onClose(); }}>Salvar OS</Button></>}>
      {/* resultado e status */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 -mt-2">
        {asset && <AssetName name={asset.name} />}
        <span className="text-small text-ink-2">{w.type === 'corretiva' ? (w.unplanned ? 'Corretiva · pane' : 'Corretiva') : 'Preventiva'}</span>
        <Badge tone={OS_STATUS[w.status].tone}>{OS_STATUS[w.status].label}</Badge>
        {res.over != null && w.status === 'concluida' && <DeltaChip value={res.est ? (res.over / res.est) * 100 : null} unit="%" digits={0} good="down" />}
      </div>
      <p className="text-h3 font-medium -mt-2">{resultText}</p>

      <div className="flex flex-wrap gap-6">
        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-6">
          {w.id && (
            <div className="grid md:grid-cols-2 gap-6">
              <section aria-label="O que aconteceu">
                <h3 className="text-h3 font-semibold mb-3">O que aconteceu</h3>
                {tl.length ? <Timeline items={tl} /> : <p className="text-small text-ink-2">Ainda sem etapas registradas.</p>}
              </section>
              <section aria-label="Estimado × realizado">
                <div className="flex flex-wrap items-baseline gap-2 mb-1"><h3 className="text-h3 font-semibold mr-auto">Estimado × realizado</h3><ChartLegend items={[{ kind: 'real-hatch', label: 'Estimado' }, { kind: 'real', label: 'Realizado' }, { kind: 'loss-hatch', label: 'Excesso' }]} /></div>
                {evItems.length ? <EstVsReal items={evItems} format={(v) => brl(v).replace(',00', '')} /> : <p className="text-small text-ink-2 py-3">{winner ? `Orçamento vencedor: ${brl(winner.value)}. Informe o valor estimado e o realizado de cada item abaixo.` : 'Escolha o orçamento vencedor ou informe o valor estimado de cada item.'}</p>}
                {res.est != null && <p className="text-small text-ink-2 mt-2 num">Total estimado {brl(res.est)}{res.real != null && <> → realizado <span className="text-ink font-medium">{brl(res.real)}</span></>}</p>}
              </section>
            </div>
          )}

          {/* checklist de itens e serviços */}
          <section aria-label="Itens e serviços" className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2"><h3 className="text-h3 font-semibold mr-auto">Itens e serviços</h3>{items.length > 0 && <span className="text-small text-ink-2 num">{doneN} de {items.length} feitos</span>}</div>
            {items.length > 0 && (
              <ul className="flex flex-col border border-line rounded-ctl overflow-hidden">
                <li aria-hidden="true" className="grid grid-cols-[auto_1fr_7.5rem_7.5rem_auto] gap-3 px-3 py-2 bg-card-2 text-caption text-ink-2"><span className="w-[18px]" /><span>Item</span><span>Estimado (R$)</span><span>Realizado (R$)</span><span className="w-8" /></li>
                {items.map((it: any) => (
                  <li key={it.id} className="grid grid-cols-[auto_1fr_7.5rem_7.5rem_auto] items-center gap-3 px-3 py-2 border-t border-line">
                    <Check aria-label={`${it.label} feito`} checked={!!it.done} onChange={(v) => upItem(it.id, 'done', v)} />
                    <InlineInput aria-label="Item" className={cx('text-body h-8 px-1 -mx-1', it.done && 'line-through text-ink-2')} value={it.label} onChange={(e) => upItem(it.id, 'label', e.target.value)} />
                    <Input type="number" aria-label={`Estimado de ${it.label}`} placeholder="Estimado" className="h-8 text-small" value={it.est ?? ''} onChange={(e) => upItem(it.id, 'est', e.target.value === '' ? null : +e.target.value)} />
                    <Input type="number" aria-label={`Realizado de ${it.label}`} placeholder="Realizado" className="h-8 text-small" value={it.real ?? ''} onChange={(e) => upItem(it.id, 'real', e.target.value === '' ? null : +e.target.value)} />
                    <IconButton size="sm" aria-label={`Remover ${it.label}`} onClick={() => set('items', items.filter((x: any) => x.id !== it.id))} className="text-ink-3"><Icon name="fechar" size={16} /></IconButton>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2"><Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Adicionar item (peça ou serviço)" onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim()) { set('items', [...items, { id: uid('it'), label: newItem.trim(), est: null, real: null, done: false }]); setNewItem(''); } }} /><Button variant="ghost" disabled={!newItem.trim()} onClick={() => { set('items', [...items, { id: uid('it'), label: newItem.trim(), est: null, real: null, done: false }]); setNewItem(''); }}>Adicionar</Button></div>
            <div>
              <p className="text-small text-ink-2 mb-2">Serviços executados (recalculam os planos com o mesmo serviço)</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">{Object.entries(SERVICES).map(([k, l]) => <Check key={k} label={l} checked={w.services.includes(k)} onChange={(v) => set('services', v ? [...w.services, k] : w.services.filter((x: string) => x !== k))} />)}</div>
            </div>
          </section>

          {/* orçamentos */}
          <section aria-label="Orçamentos" className="flex flex-col gap-3">
            <div className="flex items-center gap-2"><h3 className="text-h3 font-semibold mr-auto">Orçamentos <span className="text-ink-3 font-normal num">{w.quotes.length}/3</span></h3>{w.quotes.length < 3 && <Button size="sm" variant="ghost" onClick={() => setW({ ...w, quotes: [...w.quotes, { id: uid('q'), supplier: '', value: 0, days: 1, warranty: '', file: '' }], status: w.status === 'aberta' ? 'orcamento' : w.status })}><Icon name="mais" size={16} />Adicionar orçamento</Button>}</div>
            {w.quotes.length > 0 && (
              <div className="grid md:grid-cols-3 gap-field">
                {w.quotes.map((q: any) => {
                  const on = q.id === w.winnerId;
                  const up = (k: string, v: any) => set('quotes', w.quotes.map((x: any) => (x.id === q.id ? { ...x, [k]: v } : x)));
                  return (
                    <div key={q.id} className={cx('rounded-ctl p-card-sm flex flex-col gap-2', on ? 'bg-card-2 ring-[1.5px] ring-inset ring-ink' : 'border border-line')}>
                      <Input aria-label="Fornecedor" value={q.supplier} onChange={(e) => up('supplier', e.target.value)} placeholder="Fornecedor" className="font-medium" />
                      <div className="grid grid-cols-2 gap-2"><Field label="Valor (R$)"><Input type="number" value={q.value} onChange={(e) => up('value', +e.target.value)} /></Field><Field label="Prazo (dias)"><Input type="number" value={q.days} onChange={(e) => up('days', +e.target.value)} /></Field></div>
                      <Input aria-label="Garantia" value={q.warranty} onChange={(e) => up('warranty', e.target.value)} placeholder="Garantia" />
                      <FilePick accept="image/*,application/pdf" onFile={(d, f) => up('file', { name: f.name, data: d })} className="text-caption link-brand text-left hover:underline">{q.file ? `Anexo: ${q.file.name}` : 'Anexar orçamento (PDF ou imagem)'}</FilePick>
                      <Button size="sm" variant={on ? 'primary' : 'ghost'} onClick={() => set('winnerId', q.id)}>{on ? 'Vencedor' : 'Definir como vencedor'}</Button>
                    </div>
                  );
                })}
              </div>
            )}
            {w.quotes.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                {w.status !== 'aprovada' && si < 2 && <Button disabled={!winner} onClick={() => save({ status: 'aprovada', approvedBy: user, approvedAt: Date.now(), supplier: winner.supplier, cost: winner.value, items: items.some((i: any) => i.est != null) ? items : items.map((i: any, k: number, arr: any[]) => ({ ...i, est: k === arr.length - 1 ? winner.value - Math.round(winner.value / arr.length) * (arr.length - 1) : Math.round(winner.value / arr.length) })), comments: [...w.comments, { id: uid('c'), ts: Date.now(), user, text: `Serviço autorizado com ${winner.supplier} (${brl(winner.value)}).` }] })}>{winner ? `Autorizar serviço com ${winner.supplier}` : 'Escolha o vencedor para autorizar'}</Button>}
                {w.approvedAt && <span className="text-small text-ink-2">Autorizado por {w.approvedBy} em <span className="num">{fmtDT(w.approvedAt)}</span></span>}
              </div>
            )}
          </section>

          {/* evidências e comentários */}
          <section aria-label="Evidências" className="flex flex-col gap-2">
            <h3 className="text-h3 font-semibold">Evidências</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {w.evidences.map((e: any) => (
                <div key={e.id} className="rounded-ctl border border-line p-2 flex flex-col gap-1">
                  {e.type.startsWith('image') && <img src={e.data} alt={e.name} loading="lazy" decoding="async" className="w-full h-24 object-cover rounded-tight" />}
                  {e.type.startsWith('video') && <video src={e.data} controls className="w-full h-24 rounded-tight bg-ink" />}
                  {e.type.startsWith('audio') && <audio src={e.data} controls className="w-full" />}
                  <span className="text-caption text-ink-2 truncate">{e.name}</span>
                  <TextButton tone="danger" className="self-start text-caption" onClick={() => set('evidences', w.evidences.filter((x: any) => x.id !== e.id))}>Remover</TextButton>
                </div>
              ))}
              <FilePick multiple accept="image/*,video/*,audio/*" onFile={(d, f) => setW((cur: any) => ({ ...cur, evidences: [...cur.evidences, { id: uid('e'), type: f.type, name: f.name, data: d, ts: Date.now() }] }))} className="h-28 rounded-ctl border border-dashed border-line-strong bg-card-2 hover:bg-surface-muted text-small text-ink-2 flex flex-col items-center justify-center gap-1"><Icon name="camera" size={20} className="text-ink-3" />Foto, áudio ou vídeo curto</FilePick>
            </div>
          </section>
          <section aria-label="Comentários" className="flex flex-col gap-2">
            <h3 className="text-h3 font-semibold">Comentários</h3>
            {w.comments.map((c: any) => <div key={c.id} className="text-body bg-card-2 rounded-ctl p-3"><span className="font-medium">{c.user}</span> <span className="text-caption num text-ink-2">{fmtDT(c.ts)}</span><div className="mt-hair">{c.text}</div></div>)}
            <div className="flex gap-2"><Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva um comentário" /><Button variant="ghost" disabled={!comment} onClick={() => { set('comments', [...w.comments, { id: uid('c'), ts: Date.now(), user, text: comment }]); setComment(''); }}>Comentar</Button></div>
          </section>
        </div>

        {/* lateral: dados, andamento e nota fiscal */}
        <aside className="flex-[1_1_300px] max-w-[360px] flex flex-col gap-4">
          <Panel className="flex flex-col gap-3">
            <h3 className="text-h3 font-semibold">Dados da OS</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
              <Field label="Tipo"><Select value={w.type} onChange={(e) => set('type', e.target.value)} options={[{ value: 'corretiva', label: 'Corretiva' }, { value: 'preventiva', label: 'Preventiva' }]} /></Field>
              <Field label="Ativo"><SearchSelect value={w.assetId} onChange={(v) => set('assetId', v)} options={opAssets(s).map((a: any) => ({ value: a.id, label: a.name }))} /></Field>
            </div>
            <Field label={asset?.meter === 'horimetro' ? 'Horímetro na OS' : 'Km na OS'} hint={`Atual: ${num(asset?.meter === 'horimetro' ? s.vehicles[w.assetId]?.hourmeter : assetKm(s, w.assetId))}`}><Input type="number" value={w.odometerAt || ''} onChange={(e) => set('odometerAt', +e.target.value)} /></Field>
            {w.type === 'corretiva' && <Check label="Pane não planejada" checked={w.unplanned} onChange={(v) => set('unplanned', v)} />}
            <Field label="Título"><Input value={w.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Troca de embreagem" /></Field>
            <Field label="Descrição"><Textarea rows={2} value={w.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
          </Panel>
          <Panel className="flex flex-col gap-3">
            <h3 className="text-h3 font-semibold">Andamento</h3>
            <Field label="Entrada na oficina"><Input type="datetime-local" value={w.shopInAt ? new Date(w.shopInAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={(e) => set('shopInAt', new Date(e.target.value).getTime())} /></Field>
            {w.status === 'aprovada' && <Button variant="ghost" onClick={() => save({ status: 'execucao', shopInAt: w.shopInAt || Date.now() })}>Iniciar execução</Button>}
            {['execucao', 'aprovada', 'aberta', 'orcamento'].includes(w.status) && w.id && <Button onClick={() => { if (w.services.length && !w.odometerAt) return toast.error('Informe o km da OS para recalcular os planos.', 'Falta o km da OS'); const realSum = sum(items.map((i: any) => i.real || 0)); save({ status: 'concluida', releasedAt: Date.now(), shopInAt: w.shopInAt || w.openedAt, cost: w.cost || realSum || winner?.value || w.nf.valor || 0, items: items.map((i: any) => ({ ...i, done: true })) }); }}>Concluir e liberar veículo</Button>}
            {!w.releasedAt && w.shopInAt && <StatusDot kind="parado" label={<>Indisponível há <span className="num">{num((Date.now() - w.shopInAt) / HOUR, 0)} h</span></>} />}
            <Field label="Custo final (R$)"><Input type="number" value={w.cost || ''} onChange={(e) => set('cost', +e.target.value)} /></Field>
          </Panel>
          <Panel className="flex flex-col gap-3">
            <h3 className="text-h3 font-semibold">Nota fiscal</h3>
            <Dropzone label="Arquivo da nota" accept="image/*,application/pdf,.xml" maxMB={4} hint="XML, PDF ou foto até 4 MB" className="h-24"
              value={w.nf.file?.data} fileName={w.nf.file?.name} onChange={(d, f) => set('nf', { ...w.nf, file: d ? { name: f?.name || 'nota', data: d } : undefined })} />
            <Field label="Nº da nota"><Input value={w.nf.numero} onChange={(e) => set('nf', { ...w.nf, numero: e.target.value })} /></Field>
            <Field label="Chave de acesso"><Input className="font-mono" value={w.nf.chave} onChange={(e) => set('nf', { ...w.nf, chave: e.target.value.replace(/\D/g, '').slice(0, 44) })} placeholder="44 dígitos" /></Field>
            <Field label="Valor da nota (R$)"><Input type="number" value={w.nf.valor || ''} onChange={(e) => set('nf', { ...w.nf, valor: +e.target.value })} /></Field>
            <Field label="Integração com ERP"><Select value={w.nf.erp} onChange={(e) => set('nf', { ...w.nf, erp: e.target.value })} options={[{ value: 'nenhum', label: 'Não enviar' }, { value: 'proprio', label: 'ERP próprio da plataforma' }, { value: 'omie', label: 'Omie' }, { value: 'bling', label: 'Bling' }, { value: 'webhook', label: 'Webhook / API genérica' }]} /></Field>
            {w.nf.erp !== 'nenhum' && <Button size="sm" variant="ghost" onClick={() => set('nf', { ...w.nf, synced: Date.now() })}>{w.nf.synced ? `Enviado em ${fmtDT(w.nf.synced)} (simulado)` : 'Enviar ao ERP'}</Button>}
          </Panel>
        </aside>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- planos
// prazo de crítico: exceção do plano ou padrão da empresa (parâmetro do Setup)
const critCell = (x: any) => { const has = (v: any) => v != null && v !== ''; const own = has(x.critDays) || has(x.critKm); const d = has(x.critDays) ? +x.critDays : CRIT_DEFAULT.days, k = has(x.critKm) ? +x.critKm : CRIT_DEFAULT.km; return <span className={own ? '' : 'text-ink-3'}>{[x.trigger !== 'km' && `${d} dias`, x.trigger !== 'tempo' && `${num(k)} km`].filter(Boolean).join(' / ')}{!own && ' · padrão'}</span>; };
function Planos() {
  const plans = useStore((s) => s.plans);
  const assets = useStore((s) => opAssets(s));
  const { upsert, remove } = useStore.getState();
  const [p, setP] = useState<any>(null);
  return (
    <>
      <Card title="Planos de manutenção preventiva" actions={<Button variant="ghost" onClick={() => setP({ name: '', service: 'oleo_motor', items: '', trigger: 'ambos', kmInterval: 10000, daysInterval: 180, advanceKm: 1000, advanceDays: 15, assetIds: [] })}><Icon name="mais" size={16} />Novo plano</Button>}>
        <Table onRow={(i) => setP({ ...plans[i] })} head={['Plano', 'Serviço', 'Gatilho', 'Intervalo', 'Antecedência', 'Crítico após', 'Ativos', '']} rows={plans.map((x: any) => [<span className="font-medium">{x.name}</span>, SERVICES[x.service], { km: 'Quilometragem', tempo: 'Tempo', ambos: 'Km + tempo (o que vencer primeiro)' }[x.trigger as 'km'], [x.trigger !== 'tempo' && `${num(x.kmInterval)} km/h`, x.trigger !== 'km' && `${x.daysInterval} dias`].filter(Boolean).join(' ou '), [x.advanceKm && `${num(x.advanceKm)} km`, x.advanceDays && `${x.advanceDays} dias`].filter(Boolean).join(' / ') || '—', critCell(x), <span className="num">{x.assetIds.length}</span>, <TextButton tone="danger" onClick={async (e) => { e.stopPropagation(); if (await confirmAction({ title: `Excluir o plano "${x.name}"?`, detail: 'Os ativos deixam de ter revisões previstas por este plano. As OS já abertas continuam.' })) { remove('plans', x.id); toast('Plano excluído.', { action: { label: 'Desfazer', onClick: () => upsert('plans', x) } }); } }}>Excluir</TextButton>])} />
      </Card>
      <Modal open={!!p} onClose={() => setP(null)} title={p?.id ? 'Editar plano' : 'Novo plano'} width="max-w-3xl" footer={<><Button variant="ghost" onClick={() => setP(null)}>Cancelar</Button><Button disabled={!p?.name} onClick={() => { upsert('plans', { ...p, kmInterval: +p.kmInterval, daysInterval: +p.daysInterval, advanceKm: +p.advanceKm, advanceDays: +p.advanceDays, critDays: p.critDays === '' || p.critDays == null ? null : +p.critDays, critKm: p.critKm === '' || p.critKm == null ? null : +p.critKm }); toast(p.id ? 'Plano atualizado.' : 'Plano criado.'); setP(null); }}>Salvar plano</Button></>}>
        {p && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-field"><Field label="Nome"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field><Field label="Serviço"><Select value={p.service} onChange={(e) => setP({ ...p, service: e.target.value })} options={Object.entries(SERVICES).map(([k, l]) => ({ value: k, label: l }))} /></Field></div>
          <Field label="Gatilho"><Select value={p.trigger} onChange={(e) => setP({ ...p, trigger: e.target.value })} options={[{ value: 'km', label: 'Quilometragem / horímetro rodado' }, { value: 'tempo', label: 'Tempo desde a última manutenção' }, { value: 'ambos', label: 'Km + tempo — o que vencer primeiro' }]} /></Field>
          <FormGroup cols={4}>
            {p.trigger !== 'tempo' && <Field label="A cada (km ou h)"><Input type="number" value={p.kmInterval} onChange={(e) => setP({ ...p, kmInterval: e.target.value })} /></Field>}
            {p.trigger !== 'km' && <Field label="A cada (dias)"><Input type="number" value={p.daysInterval} onChange={(e) => setP({ ...p, daysInterval: e.target.value })} /></Field>}
            {p.trigger !== 'tempo' && <Field label="Abrir OS antes (km/h)"><Input type="number" value={p.advanceKm} onChange={(e) => setP({ ...p, advanceKm: e.target.value })} /></Field>}
            {p.trigger !== 'km' && <Field label="Abrir OS antes (dias)"><Input type="number" value={p.advanceDays} onChange={(e) => setP({ ...p, advanceDays: e.target.value })} /></Field>}
          </FormGroup>
          <FormGroup cols={4}>
            {p.trigger !== 'km' && <Field label="Crítico após (dias)" hint={`Vazio: padrão da empresa (${CRIT_DEFAULT.days} dias)`}><Input type="number" placeholder={String(CRIT_DEFAULT.days)} value={p.critDays ?? ''} onChange={(e) => setP({ ...p, critDays: e.target.value })} /></Field>}
            {p.trigger !== 'tempo' && <Field label="Crítico após (km/h)" hint={`Vazio: padrão da empresa (${num(CRIT_DEFAULT.km)} km)`}><Input type="number" placeholder={String(CRIT_DEFAULT.km)} value={p.critKm ?? ''} onChange={(e) => setP({ ...p, critKm: e.target.value })} /></Field>}
          </FormGroup>
          <Field label="Itens do plano" hint="Separados por vírgula; viram o checklist das OS geradas pelo plano."><Textarea rows={2} value={p.items} onChange={(e) => setP({ ...p, items: e.target.value })} /></Field>
          <p className="text-small font-medium text-ink-2">Aplicar aos ativos</p>
          <div className="flex flex-wrap gap-x-grid gap-y-tight">{assets.map((a: any) => <Check key={a.id} label={a.name} checked={p.assetIds.includes(a.id)} onChange={(v) => setP({ ...p, assetIds: v ? [...p.assetIds, a.id] : p.assetIds.filter((x: string) => x !== a.id) })} />)}</div>
        </>}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- alertas e e-mails (escalonamento; fila simulada)
const ESC_DOT: Record<EscLevel, 'crit' | 'parado'> = { alerta: 'parado', crit: 'crit', sem_acao: 'crit' };
function Escalonamento() {
  const recipients: Recipient[] = useStore((s) => s.maintRecipients) || [];
  const outbox: OutMail[] = useStore((s) => s.outbox) || [];
  const assets = useStore((s) => s.assets);
  const { upsert, remove } = useStore.getState();
  const empty = { level: 'alerta' as EscLevel, name: '', role: '', email: '', waitHours: 48 };
  const [r, setR] = useState(empty);
  const valid = r.name.trim() && /^\S+@\S+\.\S+$/.test(r.email.trim()) && (r.level !== 'sem_acao' || +r.waitHours > 0);
  const add = () => { upsert('maintRecipients', { id: uid('rc'), ...r, name: r.name.trim(), email: r.email.trim(), waitHours: r.level === 'sem_acao' ? +r.waitHours : 0 }); setR({ ...empty, level: r.level }); runMaintJobs(); };
  const assetName = (id: string) => assets.find((a: any) => a.id === id)?.name || '';
  return (
    <Stack gap="grid">
      <Card title="Quem recebe e-mail em cada nível">
        <p className="text-small text-ink-2 mb-4 max-w-[80ch]">O e-mail sai quando a OS entra em Alerta (passou do gatilho) e em Crítico (passou do prazo de crítico do plano). Se a OS continuar crítica sem mudar de etapa pelo tempo definido, o nível "Crítico sem ação" avisa a próxima pessoa, como o dono da empresa.</p>
        <div className="flex flex-col gap-3 mb-4">
          <Tabs value={r.level} onChange={(k) => setR({ ...r, level: k as EscLevel })} tabs={(Object.keys(ESC_LEVELS) as EscLevel[]).map((k) => ({ key: k, label: ESC_LEVELS[k] }))} />
          <div className="grid gap-field md:grid-cols-[1fr_1fr_1.2fr_auto_auto] items-end">
            <Field label="Nome"><Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></Field>
            <Field label="Função"><Input value={r.role} placeholder="Ex.: gestor de frota" onChange={(e) => setR({ ...r, role: e.target.value })} /></Field>
            <Field label="E-mail"><Input type="email" value={r.email} onChange={(e) => setR({ ...r, email: e.target.value })} /></Field>
            {r.level === 'sem_acao' ? <Field label="Avisar após (h)"><Input type="number" className="w-28" value={r.waitHours} onChange={(e) => setR({ ...r, waitHours: e.target.value as any })} /></Field> : <span />}
            <Button disabled={!valid} onClick={add}><Icon name="mais" size={16} />Adicionar</Button>
          </div>
        </div>
        <Table minWidth={720} empty="Ninguém recebe e-mail ainda." head={['Nível', 'Nome', 'E-mail', 'Quando', '']} rows={recipients.map((x) => [
          <StatusDot kind={ESC_DOT[x.level]} label={ESC_LEVELS[x.level]} />, <span><span className="font-medium">{x.name}</span>{x.role && <span className="block text-caption text-ink-2">{x.role}</span>}</span>, x.email,
          <span className="text-ink-2">{x.level === 'sem_acao' ? `Crítica há ${x.waitHours} h sem a OS andar` : x.level === 'crit' ? 'Ao entrar em Crítico' : 'Ao entrar em Alerta'}</span>,
          <TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir ${x.name}?`, detail: 'A pessoa deixa de receber os avisos de manutenção.' })) { remove('maintRecipients', x.id); toast('Destinatário excluído.', { action: { label: 'Desfazer', onClick: () => upsert('maintRecipients', x) } }); } }}>Excluir</TextButton>])} />
      </Card>
      <Card title="Caixa de saída">
        <p className="text-small text-ink-2 mb-4 max-w-[80ch]">Na demonstração os e-mails ficam na fila e não são enviados. Em produção, um serviço lê esta fila e envia pelo provedor de e-mail.</p>
        <Table minWidth={860} empty="Nenhum e-mail gerado ainda." head={['Quando', 'Nível', 'Para', 'Assunto', 'Ativo', 'Situação']} rows={outbox.slice(0, 100).map((o) => [
          <span className="num whitespace-nowrap">{fmtDT(o.ts)}</span>, <StatusDot kind={ESC_DOT[o.level]} label={ESC_LEVELS[o.level]} />,
          <span><span className="font-medium">{o.to}</span><span className="block text-caption text-ink-2">{o.email}</span></span>,
          <span><span>{o.title}</span><span className="block text-caption text-ink-2">{o.detail}</span></span>,
          <AssetName name={assetName(o.assetId)} />, <span className="text-ink-2">Na fila (simulação)</span>])} />
      </Card>
    </Stack>
  );
}
