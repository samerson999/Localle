import { RetiredToggle } from '../components/RetiredToggle';
import { opAssets } from '../lib/assetLifecycle';
import { useMemo, useState } from 'react';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Tabs, Pills, Modal, PageHeader, TabPanel, TextButton, Progress, DateInput, Callout, cx, toast, Panel, SearchInput, EmptyState, Stack, Grid } from '../components/ui';
import { PeriodCompare, presetValue, periodRanges, BI_PRESETS, type PeriodValue } from '../components/PeriodCompare';
import { KpiTile, ChartCard, StatusDot, NeedsList, Num, AssetName, IdChip, type StatusKind } from '../components/story';
import { ColumnChart, TipItem } from '../components/charts';
import { Icon } from '../components/icons';
import { CTB } from '../lib/catalog';

import { FINE_PARAMS, SEVERITIES, driverAt, validateFine, indicationDue, indicationState, notifiedOf, notifiedEstimated, PENDING, cnhRisk, type IndicationState } from '../lib/fines';
import { brl, fmtD, fmtDT, num, pct, sum, groupBy, monthKey, monthLabel, toInputD, toInputDT, isPlate, DAY } from '../lib/utils';

const STATUS: Record<string, { label: string; kind: StatusKind }> = {
  aberta: { label: 'Em aberto', kind: 'parado' }, condutor_indicado: { label: 'Condutor indicado', kind: 'off' }, recurso: { label: 'Em recurso', kind: 'off' },
  recurso_indeferido: { label: 'Recurso indeferido', kind: 'off' }, paga: { label: 'Paga', kind: 'mov' }, cancelada: { label: 'Cancelada', kind: 'off' },
};
const IND: Record<IndicationState, { label: string; kind: StatusKind }> = { feita: { label: 'Indicado', kind: 'mov' }, vencida: { label: 'Prazo perdido', kind: 'loss' }, critica: { label: 'Últimos dias', kind: 'crit' }, aviso: { label: 'Prazo acabando', kind: 'parado' }, no_prazo: { label: 'No prazo', kind: 'off' }, nao_se_aplica: { label: '—', kind: 'off' } };
const daysLeft = (t: number) => Math.ceil((t - Date.now()) / DAY);
const leftText = (t: number) => { const d = daysLeft(t); return d < 0 ? `venceu há ${-d} ${-d === 1 ? 'dia' : 'dias'}` : d === 0 ? 'vence hoje' : `faltam ${d} ${d === 1 ? 'dia' : 'dias'}`; };
const Plate = ({ name }: { name: string }) => <AssetName name={name} />;

export default function Multas() {
  const [tab, setTab] = useState('visao');
  const [edit, setEdit] = useState<any>(null);
  const [period, setPeriod] = useState<PeriodValue>(() => presetValue(BI_PRESETS.find((p) => p.key === '12m') || BI_PRESETS[0], 'anterior'));
  return (
    <div>
      <PageHeader icon="multas" title="Gestão de multas" subtitle="Lançamento, indicação do condutor e risco de suspensão da CNH" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head">
        <RetiredToggle />
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'visao', label: 'Visão geral' }, { key: 'lista', label: 'Multas' }, { key: 'cnh', label: 'Pontos na CNH' }]} />
        {tab === 'visao' && <div className="ml-auto"><PeriodCompare value={period} onChange={setPeriod} /></div>}
      </div>
      <TabPanel id={tab}>
        {tab === 'visao' && <Visao onOpen={setEdit} period={period} />}
        {tab === 'lista' && <Lista onOpen={setEdit} />}
        {tab === 'cnh' && <Cnh />}
      </TabPanel>
      {edit && <FineForm f={edit} setF={setEdit} />}
    </div>
  );
}

function useNames() {
  const s = useStoreData();
  return { a: (id: string) => s.assets.find((x: any) => x.id === id)?.name || '—', d: (id: string) => s.drivers.find((x: any) => x.id === id)?.name || '—', o: (id: string) => s.operations.find((x: any) => x.id === id)?.name || '—' };
}
// formulário a partir de uma multa salva (datas no formato dos campos)
// notificação estimada: o campo fica vazio para a data real, e o prazo segue marcado como estimado
const toForm = (f: any) => ({ ...f, ts: toInputDT(f.ts), notifiedAt: notifiedEstimated(f) ? '' : toInputD(f.notifiedAt), estimatedNotice: notifiedEstimated(f) ? notifiedOf(f) : undefined, dueDate: toInputD(f.dueDate) });

// indicar o condutor: registra quando e muda o status
function indicate(f: any) {
  const s = useStore.getState();
  if (!f.driverId) return toast('Escolha o condutor antes de indicar.', { tone: 'crit' });
  s.upsert('fines', { id: f.id, status: 'condutor_indicado', indicatedAt: Date.now() });
  toast(`Condutor indicado: ${s.drivers.find((d: any) => d.id === f.driverId)?.name}.`, { detail: `Auto ${f.auto}` });
}

// ---------------------------------------------------------------- visão geral (BI)
const DIMS = [{ key: 'assetId', label: 'Veículo' }, { key: 'driverId', label: 'Motorista' }, { key: 'operationId', label: 'Operação' }];
function Visao({ onOpen, period }: { onOpen: (f: any) => void; period: PeriodValue }) {
  const s = useStoreData();
  const N = useNames();
  const [dim, setDim] = useState('assetId');
  const { a, b } = periodRanges(period);
  const live = (r: [number, number]) => s.fines.filter((x: any) => x.ts >= r[0] && x.ts <= r[1] && x.status !== 'cancelada');
  const A = useMemo(() => live(a), [s.fines, a[0], a[1]]);
  const B = useMemo(() => (b ? live(b) : null), [s.fines, b?.[0], b?.[1]]);
  const cost = sum(A.map((x: any) => x.value)), costB = B && B.length ? sum(B.map((x: any) => x.value)) : null;
  const rel = (x: number, y: number | null) => (y ? ((x - y) / y) * 100 : null);
  const pending = s.fines.filter((x: any) => ['critica', 'aviso'].includes(indicationState(x))).sort((p: any, q: any) => indicationDue(p) - indicationDue(q));
  const openCost = sum(s.fines.filter((x: any) => ['aberta', 'condutor_indicado', 'recurso'].includes(x.status)).map((x: any) => x.value));
  // custo por mês do período (barras crescem pelo padrão de motion: --t-bar, em cascata)
  const months = Object.entries(groupBy(A, (x: any) => monthKey(x.ts))).sort(([p], [q]) => p.localeCompare(q)).map(([k, arr]: any) => ({ mes: monthLabel(k), valor: Math.round(sum(arr.map((x: any) => x.value))), qtd: arr.length }));
  const peak = months.reduce((m: any, x) => (!m || x.valor > m.valor ? x : m), null);
  const sev = SEVERITIES.map((k) => { const arr = A.filter((x: any) => x.severity === k); return { k, n: arr.length, v: sum(arr.map((x: any) => x.value)) }; });
  const name = (key: string, id: string) => (key === 'assetId' ? N.a(id) : key === 'driverId' ? N.d(id) : N.o(id));
  const by = Object.entries(groupBy(A, (x: any) => x[dim] || '')).map(([id, arr]: any) => ({ id, n: arr.length, pts: sum(arr.map((x: any) => x.points)), v: sum(arr.map((x: any) => x.value)) })).sort((p, q) => q.v - p.v);
  const top = Object.entries(groupBy(A, (x: any) => x.code)).map(([code, arr]: any) => ({ code, desc: arr[0].description, sev: arr[0].severity, n: arr.length, v: sum(arr.map((x: any) => x.value)) })).sort((p, q) => q.n - p.n || q.v - p.v).slice(0, 6);
  // prazos de indicação perdidos no período (pelo fim do prazo): a pontuação ficou com a empresa e cabe a NIC
  const lost = (r: [number, number]) => s.fines.filter((x: any) => indicationState(x) === 'vencida' && indicationDue(x) >= r[0] && indicationDue(x) <= r[1]);
  const lostA = lost(a), lostB = b ? lost(b) : null;
  const risk = cnhRisk(s).filter((r: any) => r.pct >= FINE_PARAMS.riskWarnPct);
  return (
    <Stack gap="grid">
      <Grid cols={5} equal>
        <KpiTile label="Custo em multas" display={<Num value={cost} prefix="R$" digits={2} size="kpi" count />} delta={{ value: rel(cost, costB), unit: '%', good: 'down' }} sub={`${A.length} ${A.length === 1 ? 'infração' : 'infrações'} no período`} />
        <KpiTile label="Pontos gerados" value={sum(A.map((x: any) => x.points))} delta={{ value: B && B.length ? sum(A.map((x: any) => x.points)) - sum(B.map((x: any) => x.points)) : null, unit: '', digits: 0, good: 'down' }} sub={`${A.filter((x: any) => x.severity === 'Gravíssima').length} gravíssimas`} />
        <KpiTile label="Indicações a fazer" value={pending.length} status={pending.some((x: any) => indicationState(x) === 'critica') ? 'crit' : pending.length ? 'parado' : undefined} sub={`${pending.filter((x: any) => indicationState(x) === 'critica').length} nos últimos ${FINE_PARAMS.indicationCriticalDays} dias (no Precisa de você); aviso a ${FINE_PARAMS.indicationAlertDays} dias`} />
        <KpiTile label="Prazos de indicação perdidos" value={lostA.length} status={lostA.length ? 'loss' : undefined} delta={{ value: lostB ? lostA.length - lostB.length : null, unit: '', digits: 0, good: 'down' }} sub={lostA.length ? `${brl(sum(lostA.map((x: any) => x.value)))} em multas sem condutor indicado` : 'Nenhum no período'} />
        <KpiTile label="Motoristas em risco na CNH" value={risk.length} status={risk.length ? 'parado' : undefined} sub={`Acima de ${pct(FINE_PARAMS.riskWarnPct, 0)} do limite em 12 meses`} />
      </Grid>
      <Grid split="7/5" wide equal>
        <ChartCard title="Custo por mês" icon="multas" state={months.length ? 'ready' : 'empty'} sentence={peak ? `${peak.mes} foi o mês mais caro: ${brl(peak.valor)} em ${peak.qtd} ${peak.qtd === 1 ? 'multa' : 'multas'}. Em aberto hoje: ${brl(openCost)}.` : undefined}>
          <div className="flex-1 min-h-0 flex flex-col justify-center">
            <ColumnChart data={months.map((m: any) => ({ label: m.mes, value: m.valor }))} format={(v) => `R$ ${num(v / 1000, v >= 10000 ? 0 : 1)} mil`} height={220} label="Custo com multas" good="down" />
          </div>
        </ChartCard>
        <Card title={<span className="inline-flex items-center gap-2"><StatusDot kind={pending.some((x: any) => indicationState(x) === 'critica') ? 'crit' : 'parado'} label="Indicar o condutor" className="text-h3 font-semibold" /><span className="text-small font-normal text-ink-2 num">{pending.length}</span></span>}>
          <p className="text-small text-ink-2 mb-2">Sem indicação no prazo, a pontuação fica com a empresa e a pessoa jurídica recebe nova multa (NIC).</p>
          <NeedsList empty="Nenhuma indicação perto do prazo." items={pending.slice(0, 6).map((f: any) => ({ id: f.id, icon: 'relogio', tone: (indicationState(f) === 'critica' ? 'crit' : 'warn') as 'crit' | 'warn', title: `${N.a(f.assetId)} · ${f.description}`, context: `${leftText(indicationDue(f))} (até ${fmtD(indicationDue(f))}${notifiedEstimated(f) ? ', estimado' : ''}) · auto ${f.auto}`, onClick: () => onOpen(toForm(f)) }))} />
        </Card>
      </Grid>
      <Grid split="7/5" wide equal>
        <Card title="Onde estão as multas" icon="multas" actions={<Pills value={dim} onChange={setDim} options={DIMS} />}>
          <Table minWidth={560} empty="Nenhuma multa no período." align={['left', 'right', 'right', 'right', 'left']} head={[DIMS.find((x) => x.key === dim)!.label, 'Multas', 'Pontos', 'Custo (R$)', 'Parcela do custo']} rows={by.map((x, i) => [
            dim === 'assetId' ? <Plate name={name(dim, x.id)} /> : <span className="font-medium">{x.id ? name(dim, x.id) : 'Sem condutor'}</span>, <span className="num">{x.n}</span>, <span className="num">{x.pts}</span>, <Num value={x.v} digits={2} size="body" />,
            <div key={i} className="flex items-center gap-2 min-w-[140px]"><Progress className="h-2 flex-1" value={cost ? x.v / cost : 0} color="var(--real)" label={`${pct(cost ? x.v / cost : 0, 0)} do custo`} /><span className="num w-10 text-right">{pct(cost ? x.v / cost : 0, 0)}</span></div>])} />
        </Card>
        <Card title="Por gravidade" icon="alerta">
          <ul className="flex flex-col gap-3">{sev.map((x) => (
            <TipItem title={x.k} rows={[{ label: 'Multas', value: x.n, strong: true }, { label: 'Custo', value: brl(x.v) }]} key={x.k} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-body">
              <span>{x.k}</span><Progress className="h-2" value={A.length ? x.n / A.length : 0} color={x.k === 'Gravíssima' ? 'var(--real)' : 'var(--real-mid)'} label={`${x.n} ${x.k.toLowerCase()}`} />
              <span className="num text-right"><span className="font-semibold">{x.n}</span> <span className="text-ink-2">· {brl(x.v)}</span></span>
            </TipItem>))}
          </ul>
          <p className="text-caption text-ink-2 mt-4">Pontos por gravidade (CTB art. 259): leve 3, média 4, grave 5, gravíssima 7.</p>
        </Card>
      </Grid>
      <Card title="Infrações mais frequentes" icon="ranking">
        <Table minWidth={640} empty="Nenhuma multa no período." align={['left', 'left', 'left', 'right', 'right']} head={['Código', 'Infração', 'Gravidade', 'Vezes', 'Custo (R$)']} rows={top.map((x) => [<IdChip size="sm">{x.code}</IdChip>, x.desc, x.sev, <span className="num">{x.n}</span>, <Num value={x.v} digits={2} size="body" />])} />
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- lista
function Lista({ onOpen }: { onOpen: (f: any) => void }) {
  const s = useStoreData();
  const N = useNames();
  const [flt, setFlt] = useState('indicar');
  const [q, setQ] = useState('');
  const [more, setMore] = useState(25);
  const blank = () => ({ auto: '', assetId: '', driverId: '', ts: '', notifiedAt: toInputD(Date.now()), place: '', code: '', description: '', severity: '', points: 0, value: '', dueDate: toInputD(Date.now() + FINE_PARAMS.dueDays * DAY), status: 'aberta', source: 'manual', org: 'DETRAN-PE' });
  const norm = (x: string) => (x || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  const list = [...s.fines]
    .filter((f: any) => (flt === 'indicar' ? PENDING.includes(indicationState(f)) : flt === 'perdido' ? indicationState(f) === 'vencida' : flt === 'todas' || f.status === flt))
    .filter((f: any) => !q || [f.auto, N.a(f.assetId), N.d(f.driverId), f.description, f.code].some((x) => norm(x).includes(norm(q))))
    .sort((p: any, r: any) => (flt === 'indicar' ? indicationDue(p) - indicationDue(r) : r.ts - p.ts));
  return (
    <Card title="Multas" icon="multas" actions={<Button onClick={() => onOpen(blank())}><Icon name="mais" size={16} />Lançar multa</Button>}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Pills value={flt} onChange={(k) => { setFlt(k); setMore(25); }} options={[{ key: 'indicar', label: 'Indicar condutor' }, { key: 'perdido', label: 'Prazo perdido' }, { key: 'aberta', label: 'Em aberto' }, { key: 'recurso', label: 'Em recurso' }, { key: 'paga', label: 'Pagas' }, { key: 'todas', label: 'Todas' }]} />
        <SearchInput className="ml-auto w-full sm:w-72" aria-label="Buscar multa" value={q} onChange={setQ} placeholder="Auto, placa, motorista ou infração" />
      </div>
      <Table minWidth={1120} align={['left', 'left', 'left', 'left', 'right', 'right', 'left', 'left', 'right']}
        emptyState={flt === 'indicar' ? <EmptyState illustration="ilu-tudo-em-dia" title="Nenhuma indicação pendente" detail="Todas as multas com prazo de indicação já têm condutor indicado." /> : <EmptyState illustration="ilu-multas" layout="row" title="Nenhuma multa nesta lista" detail="Troque o filtro ou lance uma multa." />}
        head={['Infração em', 'Veículo', 'Condutor', 'Infração', 'Pontos', 'Valor (R$)', 'Indicação', 'Situação', '']} rows={list.slice(0, more).map((f: any) => {
        const st = indicationState(f);
        return [<span className="num whitespace-nowrap">{fmtDT(f.ts)}</span>, <Plate name={N.a(f.assetId)} />, f.driverId ? N.d(f.driverId) : <span className="text-ink-2">não definido</span>,
          <span className="inline-flex flex-col items-start gap-hair text-small"><span>{f.description}</span><span className="text-ink-2 text-caption inline-flex items-center gap-tight"><IdChip size="sm">{f.code}</IdChip> auto <span className="font-mono">{f.auto}</span></span></span>, <span className="num">{f.points}</span>, <Num value={f.value} digits={2} size="body" />,
          st === 'nao_se_aplica' ? <span className="text-ink-3">—</span> : <span className="inline-flex flex-col"><StatusDot kind={IND[st].kind} label={IND[st].label} />{st !== 'feita' && <span className="text-caption text-ink-2">{leftText(indicationDue(f))}{notifiedEstimated(f) && ' · estimado'}</span>}</span>,
          <StatusDot kind={STATUS[f.status].kind} label={STATUS[f.status].label} />,
          <div className="flex gap-3 justify-end">{PENDING.includes(st) && f.driverId && <TextButton className="whitespace-nowrap" onClick={() => indicate(f)}>Indicar</TextButton>}<TextButton onClick={() => onOpen(toForm(f))}>Abrir</TextButton></div>];
      })} />
      {list.length > more && <div className="mt-3 flex items-center gap-3"><Button variant="ghost" size="sm" onClick={() => setMore(more + 50)}>Mostrar mais</Button><span className="text-caption text-ink-2 num">{more} de {list.length}</span></div>}
    </Card>
  );
}

// ---------------------------------------------------------------- lançamento (manual) com validação
function Msg({ err, warn }: { err?: string; warn?: string }) {
  if (err) return <span role="alert" className="text-caption font-normal text-crit-ink">{err}</span>;
  return warn ? <span className="text-caption font-normal text-warn-ink">{warn}</span> : null;
}
function FineForm({ f, setF }: { f: any; setF: (f: any) => void }) {
  const s = useStoreData();
  const [tried, setTried] = useState(false);
  const V = validateFine(s, f);
  const E = tried ? V.errors : {};
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const ts = f.ts ? new Date(f.ts).getTime() : NaN;
  const hint = isFinite(ts) && f.assetId ? driverAt(s, f.assetId, ts) : null;
  // ao escolher veículo ou horário, o condutor sugerido entra se o campo ainda estiver vazio
  const withHint = (next: any) => { const t = next.ts ? new Date(next.ts).getTime() : NaN; const h = isFinite(t) && next.assetId ? driverAt(s, next.assetId, t) : null; return !next.driverId && h ? { ...next, driverId: h.driverId } : next; };
  const est = !f.notifiedAt && f.estimatedNotice;
  const due = f.notifiedAt ? new Date(f.notifiedAt + 'T12:00').getTime() + FINE_PARAMS.indicationDays * DAY : est ? f.estimatedNotice + FINE_PARAMS.indicationDays * DAY : null;
  const save = () => {
    setTried(true);
    if (!V.ok) return toast('Confira os campos destacados antes de salvar.', { tone: 'crit' });
    const a = s.assets.find((x: any) => x.id === f.assetId);
    const { estimatedNotice: _e, ...row } = f;
    s.upsert('fines', { ...row, auto: f.auto.trim().toUpperCase(), ts, notifiedAt: f.notifiedAt ? new Date(f.notifiedAt + 'T12:00').getTime() : undefined, dueDate: new Date(f.dueDate + 'T12:00').getTime(), operationId: a?.operationId, value: +f.value, points: +f.points });
    toast(f.id ? 'Multa atualizada.' : 'Multa lançada.', { detail: Object.keys(V.warns).length ? `${Object.keys(V.warns).length} ${Object.keys(V.warns).length === 1 ? 'aviso ficou' : 'avisos ficaram'} para conferir` : undefined });
    setF(null);
  };
  const canIndicate = f.id && f.status === 'aberta' && !f.indicatedAt;
  return (
    <Modal open onClose={() => setF(null)} title={f.id ? `Multa ${f.auto}` : 'Lançar multa'} width="max-w-3xl" footer={<>
      {canIndicate && <Button variant="ghost" className="mr-auto" disabled={!f.driverId} onClick={() => { indicate(f); setF(null); }}>Indicar condutor</Button>}
      <Button variant="quiet" onClick={() => setF(null)}>Cancelar</Button><Button onClick={save}>{f.id ? 'Salvar multa' : 'Lançar multa'}</Button></>}>
      <p className="text-small text-ink-2 -mt-2">Copie os dados da notificação da autuação. Os campos são conferidos ao salvar; avisos em laranja não impedem o lançamento.</p>
      <div className="grid md:grid-cols-3 gap-field">
        <Field label="Nº do auto de infração"><Input value={f.auto} onChange={(e) => set('auto', e.target.value.toUpperCase())} className="font-mono uppercase" placeholder="Ex.: A12345678" /><Msg err={E.auto} warn={V.warns.auto} /></Field>
        <Field label="Órgão autuador"><Select value={f.org} onChange={(e) => set('org', e.target.value)} options={['DETRAN-PE', 'PRF', 'CTTU Recife', 'DER-PE', 'Prefeitura de Jaboatão', 'Outro'].map((x) => ({ value: x, label: x }))} /></Field>
        <Field label="Situação"><Select value={f.status} onChange={(e) => set('status', e.target.value)} options={Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label }))} /></Field>
        <Field label="Veículo"><SearchSelect value={f.assetId} onChange={(v) => setF(withHint({ ...f, assetId: v, driverId: '' }))} placeholder="Escolha o veículo" options={opAssets(s).filter((a: any) => a.kind === 'veiculo').map((a: any) => ({ value: a.id, label: a.name }))} /><Msg err={E.assetId} /></Field>
        <Field label="Data e hora da infração"><DateInput type="datetime-local" value={f.ts} max={toInputDT(Date.now())} onChange={(e) => setF(withHint({ ...f, ts: e.target.value }))} /><Msg err={E.ts} warn={V.warns.ts} /></Field>
        <Field label="Local"><Input value={f.place} onChange={(e) => set('place', e.target.value)} placeholder="Via, km e cidade" /><Msg err={E.place} /></Field>
        <Field label="Infração" className="md:col-span-3"><SearchSelect value={f.code} onChange={(v) => { const c = CTB.find((x) => x.code === v); setF({ ...f, ...(c || {}), value: c ? String(c.value) : f.value }); }} placeholder="Escolha pelo código ou pela descrição" options={CTB.map((c) => ({ value: c.code, label: c.code, sub: c.description }))} /><Msg err={E.code} /></Field>
        <Field label="Gravidade e pontos" hint="Fixos por lei para o código"><Input value={f.severity ? `${f.severity} · ${f.points} pontos` : '—'} disabled /></Field>
        <Field label="Valor (R$)"><Input type="number" inputMode="decimal" step="0.01" min="0" value={f.value} onChange={(e) => set('value', e.target.value)} /><Msg err={E.value} warn={V.warns.value} /></Field>
        <Field label="Vencimento do boleto"><DateInput type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /><Msg err={E.dueDate} /></Field>
      </div>
      <Panel className="flex flex-col gap-3">
        <span className="text-body font-semibold">Condutor e indicação</span>
        <div className="grid md:grid-cols-2 gap-field">
          <Field label="Recebimento da notificação da autuação"><DateInput type="date" value={f.notifiedAt} max={toInputD(Date.now())} onChange={(e) => set('notifiedAt', e.target.value)} /><Msg err={E.notifiedAt} warn={V.warns.notifiedAt || (est ? `Sem a data real: o prazo abaixo é estimado (notificação em ${fmtD(f.estimatedNotice)}). Informe a data da notificação.` : undefined)} /></Field>
          <Field label="Condutor no momento da infração"><SearchSelect value={f.driverId} onChange={(v) => set('driverId', v)} placeholder="Não identificado" options={s.drivers.map((d: any) => ({ value: d.id, label: d.name }))} /><Msg warn={V.warns.driverId} /></Field>
        </div>
        {hint ? (
          <p className="text-small text-ink-2 flex flex-wrap items-baseline gap-x-2">
            <span>Sugestão: <span className="font-semibold text-ink">{s.drivers.find((d: any) => d.id === hint.driverId)?.name}</span> · {hint.source}{hint.confidence === 'baixa' && ' (confira: não há registro do horário)'}</span>
            {f.driverId !== hint.driverId && <TextButton onClick={() => set('driverId', hint.driverId)}>Usar sugestão</TextButton>}
          </p>
        ) : <p className="text-small text-ink-2">Escolha o veículo e o horário para ver quem estava dirigindo.</p>}
        {due && f.status === 'aberta' && !f.indicatedAt && <p className={cx('text-small', daysLeft(due) <= FINE_PARAMS.indicationCriticalDays ? 'text-crit-ink' : daysLeft(due) <= FINE_PARAMS.indicationAlertDays ? 'text-warn-ink' : 'text-ink-2')}>Prazo para indicar: <span className="font-semibold num">{fmtD(due)}</span>{est && ' (estimado)'} ({leftText(due)}). São {FINE_PARAMS.indicationDays} dias da notificação (CTB art. 257, § 7º).</p>}
        {f.indicatedAt && <p className="text-small text-ink-2">Condutor indicado em <span className="num">{fmtD(f.indicatedAt)}</span>.</p>}
      </Panel>
      {tried && !V.ok && <Callout tone="crit">Há {Object.keys(V.errors).length} {Object.keys(V.errors).length === 1 ? 'campo' : 'campos'} para corrigir.</Callout>}
    </Modal>
  );
}

// ---------------------------------------------------------------- pontos na CNH
function Cnh() {
  const s = useStoreData();
  const rows = cnhRisk(s);
  return (
    <Card title="Risco de suspensão da CNH" icon="usuario">
      <p className="text-small text-ink-2 mb-4 max-w-[90ch]">Pontos dos últimos 12 meses, pela data da infração, sem as multas canceladas. Os pontos ficam com o condutor indicado. Em risco a partir de {pct(FINE_PARAMS.riskWarnPct, 0)} do limite.</p>
      <Table minWidth={860} align={['left', 'right', 'right', 'right', 'right', 'left', 'left']} head={['Motorista', 'Multas', 'Gravíssimas', 'Pontos', 'Limite', 'Uso do limite', 'Próximos pontos saem em']} rows={rows.map((r: any) => [
        <span className="inline-flex flex-col"><span className="font-medium">{r.name}</span>{r.ear && <span className="text-caption text-ink-2">CNH com EAR</span>}</span>, <span className="num">{r.n}</span>, <span className="num">{r.grav}</span>, <span className="num font-medium">{r.pts}</span>, <span className="num">{r.limit}</span>,
        <div className="flex items-center gap-2 min-w-[170px]"><Progress className="h-2 flex-1" value={r.pct} color={r.pct >= 1 ? 'var(--crit)' : r.pct >= FINE_PARAMS.riskWarnPct ? 'var(--warn)' : 'var(--real)'} label={`${pct(r.pct, 0)} do limite`} /><span className="num w-11 text-right">{pct(Math.min(r.pct, 9.99), 0)}</span></div>,
        r.next ? <span className="num">{fmtD(r.next)}</span> : <span className="text-ink-3">—</span>])} />
      <div className="text-caption text-ink-2 mt-4 flex flex-col gap-1 max-w-[100ch]">
        <p>Limites do CTB art. 261 (Lei 14.071/2020): <Num value={FINE_PARAMS.limit2Grav} size="small" className="text-caption" /> pontos com duas ou mais gravíssimas, <Num value={FINE_PARAMS.limit1Grav} size="small" className="text-caption" /> com uma e <Num value={FINE_PARAMS.limit0Grav} size="small" className="text-caption" /> sem gravíssima. Com EAR na CNH, <Num value={FINE_PARAMS.limitEar} size="small" className="text-caption" /> pontos qualquer que seja a gravidade (§ 5º), com curso preventivo de reciclagem facultado ao atingir 30.</p>
        <p>Os limites são parâmetros do Setup com piso legal: a empresa pode alertar antes, nunca depois da lei.</p>
      </div>
    </Card>
  );
}
