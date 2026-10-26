import { RetiredToggle } from '../components/RetiredToggle';
import { opAssets } from '../lib/assetLifecycle';
import { useMemo, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { useStore, assetKm } from '../lib/store';
import { cancelarViagem, criarViagem, removerMatrizViagem, salvarMatrizViagem } from '../lib/localleApi';
import { registerGate } from '../lib/gate';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Tabs, Pills, Modal, PageHeader, cx, TextButton, Callout, EmptyState, Progress, TabPanel, toast, Check, DescList, DescRow, confirmAction, Grid, Stack } from '../components/ui';
import { Dropzone } from '../components/Dropzone';
import { PeriodCompare, presetValue, periodRanges, rangeText, BI_PRESETS, type PeriodValue } from '../components/PeriodCompare';
import { KpiTile, ChartCard, StatusDot, StatusGlyph, Num, AssetName } from '../components/story';
import { StackedColumns } from '../components/charts';
import { TILE, ATTR, GlideMarker, FenceShapes } from '../components/MapBits';
import { categoryOf } from '../components/assetArt';
import { Icon } from '../components/icons';
import { TRIP_PARAMS, noTripPriority, STAGES, WEEKDAYS, lastGate, nextGateKind, gateError, onStreet, statsIn, tripsIn, compliance, isLoaded, type StopStatus } from '@localle/shared/trips';
import { fmtD, fmtDT, fmtT, hm, num, pct, sum, uid, isPlate, abbr, DAY } from '@localle/shared/utils';

export default function Viagens() {
  const [tab, setTab] = useState('visao');
  const [period, setPeriod] = useState<PeriodValue>(() => presetValue(BI_PRESETS[0], 'anterior'));
  return (
    <div>
      <PageHeader title="Gestão de viagens" subtitle="Portaria, quem está na rua, viagens externas e viagens recorrentes" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head">
        <RetiredToggle />
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'visao', label: 'Visão geral' }, { key: 'portaria', label: 'Portaria' }, { key: 'rua', label: 'Quem está na rua' }, { key: 'externas', label: 'Viagens externas' }, { key: 'recorrentes', label: 'Viagens recorrentes' }]} />
        {tab === 'visao' && <div className="ml-auto"><PeriodCompare value={period} onChange={setPeriod} /></div>}
      </div>
      <TabPanel id={tab}>
        {tab === 'visao' && <Visao period={period} />}
        {tab === 'portaria' && <Portaria />}
        {tab === 'rua' && <NaRua />}
        {tab === 'externas' && <Externas />}
        {tab === 'recorrentes' && <Recorrentes />}
      </TabPanel>
    </div>
  );
}

function useNames() {
  const assets = useStore((s) => s.assets), fences = useStore((s) => s.fences), drivers = useStore((s) => s.drivers);
  return { a: (id: string) => assets.find((x: any) => x.id === id)?.name || '—', f: (id?: string) => fences.find((x: any) => x.id === id)?.name || '—', d: (id?: string) => drivers.find((x: any) => x.id === id)?.name || '—' };
}
const Plate = ({ name }: { name: string }) => <AssetName name={name} />;
const kmFmt = (v: number) => `${abbr(v, 0)} km`;

// ---------------------------------------------------------------- visão geral (BI)
function Visao({ period }: { period: PeriodValue }) {
  const s = useStore();
  const N = useNames();
  const { a, b } = periodRanges(period);
  const isVeh = (id: string) => s.assets.find((x: any) => x.id === id)?.kind === 'veiculo';
  const A = useMemo(() => statsIn(s, a[0], a[1], isVeh), [s.tripStats, JSON.stringify(period)]);
  // período anterior sem nenhum dado não serve de comparação
  const B0 = useMemo(() => (b ? statsIn(s, b[0], b[1], isVeh) : null), [s.tripStats, JSON.stringify(period)]);
  const B = B0 && B0.total.mv > 0 ? B0 : null;
  const nA = tripsIn(s, a[0], a[1]).length, nB = B && b ? tripsIn(s, b[0], b[1]).length : null;
  const comp = (r: [number, number]) => { const cs = s.matrices.map((m: any) => compliance(s, m, r[0], r[1])); const tot = sum(cs.map((c: any) => c.total)); return tot ? sum(cs.map((c: any) => c.onTime)) / tot : null; };
  const cA = comp(a), cB = b ? comp(b) : null; // sem dias planejados no anterior, comp devolve null
  const tripKm = (t: any) => t.kmLoaded + t.kmEmpty;
  const emptyPct = (t: any) => (tripKm(t) ? (t.kmEmpty / tripKm(t)) * 100 : null);
  const rel = (x: number | null, y: number | null | undefined) => (x == null || y == null || !y ? null : ((x - y) / y) * 100);
  // barras por semana: km com carga, em viagem sem carga e sem viagem
  const weeks: { label: string; from: number; to: number }[] = [];
  const step = a[1] - a[0] <= 35 * DAY ? DAY : 7 * DAY; // até um mês, por dia; acima disso, por semana
  for (let t = a[0]; t <= a[1]; t += step) weeks.push({ label: fmtD(t).slice(0, 5), from: t, to: Math.min(a[1], t + step - 1) });
  const wk = (r: { from: number; to: number }) => statsIn(s, r.from, r.to, isVeh).total;
  // azul = km em viagem (com carga ou de pátio); rosa = desvio (viagem sem carga ou rodando sem viagem)
  const data = weeks.map((w) => { const t = wk(w); return { label: w.label, values: [Math.round(t.kmLoaded + t.kmTrip), Math.round(t.kmEmpty + t.kmNt)] }; });
  const rows = Object.entries(A.perAsset).map(([aid, t]) => ({ aid, t, trips: tripsIn(s, a[0], a[1]).filter((x: any) => x.assetId === aid).length })).sort((p, q) => q.t.nt - p.t.nt);
  const movingNow = s.assets.filter((x: any) => x.kind === 'veiculo' && s.vehicles[x.id]?.moving && !s.vehicles[x.id]?.noSignal && !s.trips.some((t: any) => t.assetId === x.id && t.status === 'em_andamento'));
  const worst = rows[0];
  return (
    <Stack gap="grid">
      <Grid cols={4} equal>
        <KpiTile label="Viagens externas concluídas" value={nA} delta={{ value: nB != null ? nA - nB : null, unit: '', digits: 0, good: 'up' }} />
        <KpiTile label="Rodando sem viagem" value={A.total.nt / 3600} unit="h" delta={{ value: rel(A.total.nt, B?.total.nt), unit: '%', good: 'down' }} sub={<><Num value={A.total.kmNt} unit="km" size="small" /> sem viagem atribuída</>} />
        <KpiTile label="Km em viagem sem carga" value={emptyPct(A.total)} unit="%" digits={0} delta={{ value: B && emptyPct(B.total) != null && emptyPct(A.total) != null ? emptyPct(A.total)! - emptyPct(B.total)! : null, unit: 'p.p.', good: 'down' }} sub={<><Num value={A.total.kmEmpty} unit="km" size="small" /> nas viagens externas</>} />
        <KpiTile label="Cumprimento da matriz" value={cA != null ? cA * 100 : null} unit="%" digits={0} delta={{ value: cA != null && cB != null ? (cA - cB) * 100 : null, unit: 'p.p.', good: 'up' }} sub={`Paradas no horário (±${TRIP_PARAMS.tolMin} min)`} />
      </Grid>
      <Grid split="7/5" wide equal>
        <ChartCard title={step === DAY ? 'Km rodados por dia' : 'Km rodados por semana'} icon="grafico" sentence={A.total.kmNt + A.total.kmEmpty > 0 ? `${num(((A.total.kmNt + A.total.kmEmpty) / Math.max(1, A.total.kmLoaded + A.total.kmTrip + A.total.kmEmpty + A.total.kmNt)) * 100, 0)}% dos km do período foram sem viagem ou em viagem sem carga.` : undefined}>
          <div className="flex-1 min-h-0 flex flex-col justify-center">
            <StackedColumns data={data} series={[{ label: 'Em viagem (com carga ou de pátio)', tone: 'real' }, { label: 'Sem carga ou sem viagem', tone: 'loss' }]} format={(v) => abbr(v, 0)} height={220} />
          </div>
        </ChartCard>
        <Card title={<span className="inline-flex items-center gap-2">Rodando sem viagem agora <span className="text-small font-normal text-ink-2 num">{movingNow.length}</span></span>} icon="viagens">
          <p className="text-small text-ink-2 mb-4 flex items-start gap-2"><StatusDot kind={noTripPriority() === 'media' ? 'parado' : 'off'} label="" className="mt-1" />Em movimento sem viagem em andamento. Quem acabou de concluir uma viagem externa e segue rodando é sinalizado ao monitoramento depois de {TRIP_PARAMS.noTripAlertMin} min.</p>
          {movingNow.length === 0 ? <EmptyState illustration="ilu-tudo-em-dia" title="Todos em movimento estão em viagem" /> : (
            <ul className="flex flex-col">{movingNow.map((x: any) => <li key={x.id} className="flex items-center gap-3 py-2 border-t border-line first:border-t-0 text-body"><Plate name={x.name} /><span className="text-ink-2 mr-auto truncate">{N.d(x.driverId)}</span><Num value={Math.round(s.vehicles[x.id].speed)} unit="km/h" size="body" /></li>)}</ul>
          )}
        </Card>
      </Grid>
      <Card title="Por veículo" icon="ativos">
        <p className="text-small text-ink-2 mb-3">{worst ? `${N.a(worst.aid)} é quem mais roda sem viagem no período (${hm(worst.t.nt * 1000)}).` : ''}</p>
        <Table minWidth={980} align={['left', 'right', 'right', 'right', 'right', 'right', 'left']} head={['Veículo', 'Viagens externas', 'Km com carga', 'Km em viagem sem carga', 'Km sem viagem', 'Tempo sem viagem', 'Parcela sem viagem']} rows={rows.map(({ aid, t, trips }) => {
          const all = t.kmLoaded + t.kmTrip + t.kmEmpty + t.kmNt; const share = all ? t.kmNt / all : 0;
          return [<Plate name={N.a(aid)} />, <span className="num">{trips}</span>, <Num value={t.kmLoaded} size="body" />, <span className="num">{t.kmEmpty ? <>{num(t.kmEmpty)} <span className="text-ink-2">({num(emptyPct(t) || 0, 0)}%)</span></> : '—'}</span>, <Num value={t.kmNt} size="body" />, <span className="num">{hm(t.nt * 1000)}</span>,
            <div className="flex items-center gap-2 min-w-[150px]"><Progress className="h-2 flex-1" value={share} color={share > 0.2 ? 'var(--loss)' : 'var(--real)'} label={`${pct(share, 0)} dos km sem viagem`} /><span className="num w-10 text-right">{pct(share, 0)}</span></div>];
        })} />
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- portaria
// Tela simples para o porteiro: veículo, motorista, foto e odômetro. A sequência precisa alternar saída e entrada.
function Portaria() {
  const s = useStore();
  const N = useNames();
  const vehs = opAssets(s).filter((x: any) => x.kind === 'veiculo');
  const [aid, setAid] = useState('');
  const [f, setF] = useState<any>({ driverId: '', km: '', photo: '', returnBy: `${TRIP_PARAMS.returnHour}:00` });
  const asset = vehs.find((x: any) => x.id === aid);
  const kind = aid ? nextGateKind(s, aid) : 'saida';
  const last = aid ? lastGate(s, aid) : null;
  const pickVeh = (id: string) => { const a = vehs.find((x: any) => x.id === id); setAid(id); setF({ driverId: a?.driverId || '', km: a ? String(Math.round(assetKm(s, id))) : '', photo: '', returnBy: `${TRIP_PARAMS.returnHour}:00` }); };
  const register = (k: 'saida' | 'entrada') => {
    const err = registerGate({ assetId: aid, kind: k, driverId: f.driverId, km: +f.km || 0, photo: f.photo, returnBy: f.returnBy, by: 'Portaria' });
    if (err) return toast(err, { tone: 'crit' });
    toast(`${k === 'saida' ? 'Saída' : 'Entrada'} de ${asset?.name} registrada.`); setAid('');
  };
  const log = [...(s.gateLog || [])].sort((p: any, q: any) => q.ts - p.ts).slice(0, 15);
  return (
    <Stack gap="grid">
      <Grid split="5/7" wide equal>
        <Card title="Registrar saída ou entrada" icon="viagens">
          <Stack gap="grid">
            <Field label="Veículo"><SearchSelect value={aid} onChange={pickVeh} placeholder="Escolha o veículo" options={vehs.map((x: any) => ({ value: x.id, label: x.name, sub: nextGateKind(s, x.id) === 'entrada' ? 'na rua' : 'no pátio' }))} /></Field>
            {aid && <>
              <p className="text-body">Próximo registro: <span className="font-semibold">{kind === 'saida' ? 'Saída' : 'Entrada'}</span>{last && <span className="text-ink-2"> · último: {last.kind === 'saida' ? 'saída' : 'entrada'} em <span className="num">{fmtDT(last.ts)}</span></span>}</p>
              <Field label="Motorista"><SearchSelect value={f.driverId} onChange={(v) => setF({ ...f, driverId: v })} placeholder="—" options={s.drivers.map((d: any) => ({ value: d.id, label: d.name }))} /></Field>
              <Field label="Odômetro (km)" hint="Lido do rastreador; corrija pelo painel do veículo"><Input type="number" inputMode="numeric" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} /></Field>
              {kind === 'saida' && <Field label="Volta prevista"><Input type="time" value={f.returnBy} onChange={(e) => setF({ ...f, returnBy: e.target.value })} /></Field>}
              <Dropzone label="Foto do veículo ou do painel" className="h-32" value={f.photo || undefined} onChange={(d) => setF({ ...f, photo: d })} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button className="h-12" disabled={kind !== 'saida'} onClick={() => register('saida')}>Registrar saída</Button>
                <Button className="h-12" variant="dark" disabled={kind !== 'entrada'} onClick={() => register('entrada')}>Registrar entrada</Button>
              </div>
              <p className="text-caption text-ink-2">{kind === 'saida' ? 'A entrada fica liberada depois da saída.' : 'Este veículo está na rua: só a entrada pode ser registrada.'}</p>
            </>}
          </Stack>
        </Card>
        <Card title="Últimos registros" icon="historico">
          <Table minWidth={760} align={['left', 'left', 'left', 'left', 'right', 'left']} emptyState={<EmptyState illustration="ilu-viagens" layout="row" title="Nenhum registro ainda" detail="As saídas e entradas registradas pela portaria aparecem aqui." />} head={['Horário', 'Veículo', 'Registro', 'Motorista', 'Odômetro', 'Volta prevista']} rows={log.map((g: any) => [<span className="num">{fmtDT(g.ts)}</span>, <Plate name={N.a(g.assetId)} />, g.kind === 'saida' ? 'Saída' : 'Entrada', N.d(g.driverId), g.km ? <Num value={g.km} unit="km" size="body" /> : '—', g.returnBy ? <span className="num">{fmtT(g.returnBy)}</span> : '—'])} />
        </Card>
      </Grid>
      <Card title="Como a viagem de pátio começa" icon="info">
        <p className="text-small text-ink-2 mb-3 max-w-[90ch]">A viagem de pátio conta a partir da saída de uma cerca de base (matriz ou filial). Se a portaria registra, a saída sem registro gera um aviso ao monitoramento. Bases: {s.fences.filter((x: any) => x.startsTrip).map((x: any) => x.name).join(', ') || 'nenhuma'}.</p>
        <Pills value={s.tripConfig.patioTrigger} onChange={(k) => { s.patch((st: any) => ({ tripConfig: { ...st.tripConfig, patioTrigger: k } })); toast(k === 'porteiro' ? 'A viagem de pátio agora começa pelo registro da portaria.' : 'A viagem de pátio agora começa pela saída indicada no rastreador.'); }} options={[{ key: 'rastreador', label: 'Saída indicada pelo rastreador' }, { key: 'porteiro', label: 'Saída registrada pela portaria' }]} />
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- quem está na rua (mapa)
function NaRua() {
  const s = useStore();
  const N = useNames();
  const list = onStreet(s);
  const over = list.filter((x: any) => x.overdue);
  return (
    <Grid split="8/4" wide equal>
      <Card title={`Na rua agora (${list.length})`} icon="monitoramento">
        <div className="h-[520px] rounded-ctl overflow-hidden border border-line">
          <MapContainer center={[-8.1, -34.92]} zoom={11} className="h-full w-full" scrollWheelZoom={false}>
            <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
            <FenceShapes fences={s.fences.filter((f: any) => f.startsTrip)} />
            {list.filter((x: any) => s.vehicles[x.a.id]).map((x: any) => <GlideMarker key={x.a.id} position={s.vehicles[x.a.id].pos} heading={s.vehicles[x.a.id].heading} kind={x.overdue ? 'parado' : 'mov'} category={categoryOf(x.a)} plate={x.a.name} title={`${x.a.name}: ${x.overdue ? `devia ter voltado às ${fmtT(x.due)}` : `volta prevista ${fmtT(x.due)}`}`} />)}
          </MapContainer>
        </div>
        <div className="flex flex-wrap gap-x-5 mt-3"><StatusDot kind="parado" label="Precisa voltar" className="text-ink-2" /><StatusDot kind="mov" label="Dentro do horário" className="text-ink-2" /></div>
      </Card>
      <Stack gap="grid">
        <Card title={<span className="inline-flex items-center gap-2"><StatusDot kind="parado" label="Precisam voltar" className="text-h3 font-semibold" /><span className="text-small font-normal text-ink-2 num">{over.length}</span></span>}>
          <p className="text-small text-ink-2 mb-3">Passaram da volta prevista na saída (padrão: {TRIP_PARAMS.returnHour} h).</p>
          {over.length === 0 ? <EmptyState illustration="ilu-tudo-em-dia" title="Ninguém atrasado" /> : <ul className="flex flex-col">{over.map((x: any) => <li key={x.a.id} className="py-2 border-t border-line first:border-t-0 text-body"><div className="flex items-center gap-2"><Plate name={x.a.name} /><span className="ml-auto num text-warn-ink font-medium">{hm(Date.now() - x.due)} de atraso</span></div><span className="text-caption text-ink-2 num">{N.d(x.g.driverId || x.a.driverId)} · saiu {fmtT(x.g.ts)} · volta prevista {fmtT(x.due)}</span></li>)}</ul>}
        </Card>
        <Card title={<StatusDot kind="mov" label="Dentro do horário" className="text-h3 font-semibold" />}>
          {list.filter((x: any) => !x.overdue).length === 0 ? <p className="text-small text-ink-2">Nenhum.</p> : <ul className="flex flex-col">{list.filter((x: any) => !x.overdue).map((x: any) => <li key={x.a.id} className="py-2 border-t border-line first:border-t-0 text-body"><div className="flex items-center gap-2"><Plate name={x.a.name} /><span className="ml-auto text-ink-2 num">volta {fmtT(x.due)}</span></div><span className="text-caption text-ink-2">{N.d(x.g.driverId || x.a.driverId)} · na rua há {hm(x.out)}</span></li>)}</ul>}
        </Card>
      </Stack>
    </Grid>
  );
}

// ---------------------------------------------------------------- viagens externas
const TRIP_DOT: Record<string, { kind: 'mov' | 'parado' | 'off' | 'crit'; label: string }> = { aguardando: { kind: 'off', label: 'Aguardando saída' }, em_andamento: { kind: 'mov', label: 'Em andamento' }, concluida: { kind: 'off', label: 'Concluída' }, cancelada: { kind: 'off', label: 'Cancelada' } };
function Stepper({ t }: { t: any }) {
  const N = useNames();
  return (
    <ol className="flex flex-wrap items-center gap-x-tight gap-y-1 text-caption">
      {STAGES.map((st, i) => { const at = t[st.at]; return (
        <li key={st.key} className="inline-flex items-center gap-tight">{i > 0 && <span aria-hidden="true" className={cx('w-4 h-px', at ? 'bg-ink-2' : 'bg-line-strong')} />}
          <span className={cx('inline-flex items-center gap-1', at ? 'text-ink' : 'text-ink-2')} title={at ? `${st.label}: ${fmtDT(at)}` : `${st.label}: ainda não`}><StatusGlyph kind={at ? 'mov' : 'off'} />{N.f(t[st.key])}{at && <span className="num text-ink-2">{fmtT(at)}</span>}</span>
        </li>); })}
    </ol>
  );
}
function Externas() {
  const s = useStore();
  const N = useNames();
  const [t, setT] = useState<any>(null);
  const [flt, setFlt] = useState('abertas');
  const [more, setMore] = useState(25);
  const all = s.trips.filter((x: any) => x.type === 'externo').sort((p: any, q: any) => (q.startedAt || Infinity) - (p.startedAt || Infinity));
  const list = all.filter((x: any) => (flt === 'abertas' ? ['aguardando', 'em_andamento'].includes(x.status) : x.status === flt));
  return (
    <>
      <Card title="Viagens externas" icon="viagens" actions={<Button onClick={() => setT({ stops: [], visited: [] })}><Icon name="mais" size={16} />Nova viagem</Button>}>
        <p className="text-small text-ink-2 mb-3 max-w-[90ch]">A viagem começa ao sair da cerca de origem e passa pela carga, pela descarga e pelo destino. O trecho entre carga e descarga conta como "com carga". Ao concluir, o veículo que continua rodando sem viagem é sinalizado ao monitoramento.</p>
        <div className="mb-4"><Pills value={flt} onChange={(k) => { setFlt(k); setMore(25); }} options={[{ key: 'abertas', label: 'Abertas' }, { key: 'concluida', label: 'Concluídas' }, { key: 'cancelada', label: 'Canceladas' }]} /></div>
        <Table minWidth={1180} emptyState={<EmptyState illustration="ilu-viagens" layout="row" title="Nenhuma viagem nesta lista" detail="Troque o filtro ou cadastre uma nova viagem." />} head={['Viagem', 'Veículo', 'Carga', 'Etapas', 'Situação', 'Duração', '']} rows={list.slice(0, more).map((x: any) => [
          <span className="font-medium">{x.name || '—'}</span>, <Plate name={N.a(x.assetId)} />, <span className="text-small">{x.cargo || '—'}{x.status === 'em_andamento' && <span className="block text-caption text-ink-2">{isLoaded(x) ? 'com carga' : x.unloadedAt ? 'descarregado' : 'sem carga'}</span>}</span>, <Stepper t={x} />,
          <StatusDot kind={TRIP_DOT[x.status].kind} label={TRIP_DOT[x.status].label} />, x.startedAt ? <span className="num">{hm((x.endedAt || Date.now()) - x.startedAt)}</span> : '—',
          ['aguardando', 'em_andamento'].includes(x.status) ? <TextButton tone="danger" className="whitespace-nowrap" onClick={async () => { try { await cancelarViagem(x.id); toast('Viagem cancelada.'); } catch (e: any) { toast('Não foi possível cancelar: ' + (e.message || e), { tone: 'crit' }); } }}>Cancelar</TextButton> : null])} />
        {list.length > more && <div className="mt-3 flex items-center gap-3"><Button variant="ghost" size="sm" onClick={() => setMore(more + 50)}>Mostrar mais</Button><span className="text-caption text-ink-2 num">{more} de {list.length}</span></div>}
      </Card>
      {t && <TripForm t={t} setT={setT} />}
    </>
  );
}
function TripForm({ t, setT }: any) {
  const s = useStore();
  const fences = [{ value: '', label: 'Escolha a cerca' }, ...s.fences.map((f: any) => ({ value: f.id, label: `${f.name} (${f.type})` }))];
  const ok = t.assetId && t.originFenceId && t.loadFenceId && t.unloadFenceId && t.destFenceId;
  const save = async () => { try { await criarViagem({ ...t, type: 'externo', driverId: t.driverId || s.assets.find((a: any) => a.id === t.assetId)?.driverId }); toast('Viagem criada. Ela começa quando o veículo sair da origem.'); setT(null); } catch (e: any) { toast('Não foi possível salvar: ' + (e.message || e), { tone: 'crit' }); } };
  return (
    <Modal open onClose={() => setT(null)} title="Nova viagem externa" width="max-w-3xl" footer={<><Button variant="ghost" onClick={() => setT(null)}>Cancelar</Button><Button disabled={!ok} onClick={save}>Salvar viagem</Button></>}>
      <div className="grid md:grid-cols-2 gap-field">
        <Field label="Nome da viagem"><Input value={t.name || ''} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Ex.: Coleta Candeias → Suape" /></Field>
        <Field label="Veículo"><SearchSelect value={t.assetId || ''} onChange={(v) => setT({ ...t, assetId: v, driverId: s.assets.find((a: any) => a.id === v)?.driverId || '' })} placeholder="Escolha" options={s.assets.filter((a: any) => a.tracker && a.kind === 'veiculo').map((a: any) => ({ value: a.id, label: a.name }))} /></Field>
        <Field label="Carga"><Input value={t.cargo || ''} onChange={(e) => setT({ ...t, cargo: e.target.value })} placeholder="Ex.: Cimento ensacado" /></Field>
        <Field label="Motorista"><SearchSelect value={t.driverId || ''} onChange={(v) => setT({ ...t, driverId: v })} placeholder="—" options={s.drivers.map((d: any) => ({ value: d.id, label: d.name }))} /></Field>
        {STAGES.map((st) => <Field key={st.key} label={st.label}><Select value={t[st.key] || ''} onChange={(e) => setT({ ...t, [st.key]: e.target.value })} options={fences} /></Field>)}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- viagens recorrentes (matriz) e cumprimento
const STOP_DOT: Record<StopStatus, { kind: 'mov' | 'parado' | 'crit' | 'off'; label: string }> = { no_horario: { kind: 'mov', label: 'No horário' }, atrasado: { kind: 'parado', label: 'Atrasado' }, adiantado: { kind: 'parado', label: 'Adiantado' }, nao_feito: { kind: 'parado', label: 'Não feito' }, futuro: { kind: 'off', label: 'Previsto' } };
function Recorrentes() {
  const s = useStore();
  const N = useNames();
  const [edit, setEdit] = useState<any>(null);
  const [period, setPeriod] = useState<PeriodValue>(() => presetValue(BI_PRESETS[0], 'anterior'));
  const { a, b } = periodRanges(period);
  return (
    <Stack gap="grid">
      <div className="flex flex-wrap items-center gap-2"><p className="text-small text-ink-2 mr-auto max-w-[80ch]">Viagens que se repetem na semana: paradas com horário previsto e onde o veículo dorme. O cumprimento compara o planejado com as cercas em que o veículo entrou (tolerância de ±{TRIP_PARAMS.tolMin} min).</p><Button onClick={() => setEdit({ name: '', assetId: '', driverId: '', days: [1, 2, 3, 4, 5], stops: [{ fenceId: '', time: '08:00' }], sleep: {} })}><Icon name="mais" size={16} />Nova viagem recorrente</Button></div>
      <Grid cols={2} wide equal>
        {s.matrices.map((m: any) => (
          <Card key={m.id} title={m.name} icon="rota" actions={<div className="flex gap-3"><TextButton onClick={() => setEdit(JSON.parse(JSON.stringify(m)))}>Editar</TextButton><TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir a viagem recorrente "${m.name}"?`, detail: 'Ela deixa de gerar viagens novas. As viagens já criadas continuam.' })) { try { await removerMatrizViagem(m.id); toast('Viagem recorrente excluída.'); } catch (e: any) { toast('Não foi possível excluir: ' + (e.message || e), { tone: 'crit' }); } } }}>Excluir</TextButton></div>}>
            <DescList className="mb-4">
              <DescRow label="Veículo"><Plate name={N.a(m.assetId)} />{m.driverId && <span className="text-ink-2"> · {N.d(m.driverId)}</span>}</DescRow>
              <DescRow label="Dias">{m.days.map((d: number) => WEEKDAYS[d]).join(', ')}</DescRow>
            </DescList>
            <ol className="flex flex-col mb-4">{m.stops.map((st: any, i: number) => <li key={i} className="flex items-baseline gap-3 py-tight border-t border-line first:border-t-0 text-body"><span className="num text-ink-2 w-4">{i + 1}</span><span className="mr-auto">{N.f(st.fenceId)}</span><span className="num">{st.time}</span></li>)}</ol>
            <p className="text-caption text-ink-2 mb-tight">Onde dorme</p>
            <div className="grid grid-cols-7 gap-1 text-center text-caption">{WEEKDAYS.map((w, i) => <div key={w} className={cx('rounded-chip py-tight px-1', m.sleep?.[i] ? 'bg-surface-muted' : 'text-ink-2')}><div className="text-ink-2">{w}</div><div className="truncate">{m.sleep?.[i] ? N.f(m.sleep[i]).split(' ')[0] : '—'}</div></div>)}</div>
          </Card>
        ))}
      </Grid>
      <div className="flex flex-wrap items-center gap-2 mt-2"><h2 className="text-h2 font-semibold mr-auto">Cumprimento: planejado × realizado</h2><PeriodCompare value={period} onChange={setPeriod} /></div>
      {s.matrices.map((m: any) => <Cumprimento key={m.id} m={m} a={a} b={b} />)}
      {edit && <MatrixForm m={edit} setM={setEdit} />}
    </Stack>
  );
}
function Cumprimento({ m, a, b }: { m: any; a: [number, number]; b: [number, number] | null }) {
  const s = useStore();
  const N = useNames();
  const C = useMemo(() => compliance(s, m, a[0], a[1]), [s.fenceVisits, m, a[0], a[1]]);
  const P = useMemo(() => (b ? compliance(s, m, b[0], b[1]) : null), [s.fenceVisits, m, b?.[0], b?.[1]]);
  const days = [...C.days].reverse().slice(0, 14);
  const sentence = C.rate == null ? 'Ainda não há dias planejados no período.' : `${C.onTime} de ${C.total} paradas no horário${C.missed ? `, ${C.missed} não feitas` : ''}${C.late ? `, ${C.late} fora do horário` : ''}.${C.sleepTotal ? ` Dormiu no lugar previsto em ${C.sleepOk} de ${C.sleepTotal} noites.` : ''}`;
  return (
    <ChartCard title={m.name} icon="calendario" period={rangeText(a)} sentence={sentence} aside={<span className="text-small text-ink-2">{C.rate != null ? <><span className="num font-semibold text-ink">{pct(C.rate, 0)}</span> no horário{P?.rate != null && <span className="num"> · antes {pct(P.rate, 0)}</span>}</> : null}</span>} state={C.days.length ? 'ready' : 'empty'}>
      <Table minWidth={760} head={['Dia', ...m.stops.map((st: any) => `${N.f(st.fenceId)} · ${st.time}`), 'Dormiu em']} rows={days.map((d: any) => [
        <span className="num whitespace-nowrap">{WEEKDAYS[d.wd]} {fmtD(d.day).slice(0, 5)}</span>,
        ...d.stops.map((x: any) => <span className="inline-flex flex-col"><StatusDot kind={STOP_DOT[x.status as StopStatus].kind} label={STOP_DOT[x.status as StopStatus].label} />{x.at && <span className="text-caption text-ink-2 num">{fmtT(x.at)}{x.status !== 'no_horario' ? ` (${x.diff > 0 ? '+' : ''}${Math.round(x.diff / 60000)} min)` : ''}</span>}</span>),
        d.sleep ? (d.sleep.ok == null ? <span className="text-ink-3 text-small">—</span> : <StatusDot kind={d.sleep.ok ? 'mov' : 'crit'} label={d.sleep.real ? N.f(d.sleep.real) : 'Sem registro'} />) : <span className="text-ink-3 text-small">—</span>])} />
      {C.days.length > 14 && <p className="text-caption text-ink-2 mt-2">Mostrando os 14 dias planejados mais recentes; os números consideram o período todo.</p>}
    </ChartCard>
  );
}
function MatrixForm({ m, setM }: any) {
  const s = useStore();
  const fences = [{ value: '', label: 'Escolha a cerca' }, ...s.fences.map((f: any) => ({ value: f.id, label: f.name }))];
  const ok = m.name && m.assetId && m.days.length && m.stops.length && m.stops.every((x: any) => x.fenceId && x.time);
  return (
    <Modal open onClose={() => setM(null)} title={m.id ? 'Editar viagem recorrente' : 'Nova viagem recorrente'} width="max-w-3xl" footer={<><Button variant="ghost" onClick={() => setM(null)}>Cancelar</Button><Button disabled={!ok} onClick={async () => { try { await salvarMatrizViagem(m); toast('Viagem recorrente salva.'); setM(null); } catch (e: any) { toast('Não foi possível salvar: ' + (e.message || e), { tone: 'crit' }); } }}>Salvar</Button></>}>
      <div className="grid md:grid-cols-3 gap-field">
        <Field label="Nome"><Input value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="Ex.: Entregas Recife" /></Field>
        <Field label="Veículo"><SearchSelect value={m.assetId} onChange={(v) => setM({ ...m, assetId: v, driverId: s.assets.find((a: any) => a.id === v)?.driverId || m.driverId })} placeholder="Escolha" options={s.assets.filter((a: any) => a.tracker && a.kind === 'veiculo').map((a: any) => ({ value: a.id, label: a.name }))} /></Field>
        <Field label="Motorista"><SearchSelect value={m.driverId} onChange={(v) => setM({ ...m, driverId: v })} placeholder="—" options={s.drivers.map((d: any) => ({ value: d.id, label: d.name }))} /></Field>
      </div>
      <div className="flex flex-col gap-2"><span className="text-small font-medium text-ink-2">Dias da semana</span><div className="flex flex-wrap gap-x-4 gap-y-2">{WEEKDAYS.map((w, i) => <Check key={w} label={w} checked={m.days.includes(i)} onChange={(v) => setM({ ...m, days: v ? [...m.days, i].sort() : m.days.filter((x: number) => x !== i) })} />)}</div></div>
      <div className="flex flex-col gap-2">
        <span className="text-small font-medium text-ink-2">Paradas, na ordem, com horário previsto</span>
        {m.stops.map((st: any, i: number) => (
          <div key={i} className="flex gap-2 items-end">
            <span className="num text-ink-2 w-5 pb-stack">{i + 1}</span>
            <div className="flex-1"><Select aria-label={`Parada ${i + 1}`} value={st.fenceId} onChange={(e) => setM({ ...m, stops: m.stops.map((x: any, j: number) => (j === i ? { ...x, fenceId: e.target.value } : x)) })} options={fences} /></div>
            <Input type="time" aria-label={`Horário da parada ${i + 1}`} className="w-32" value={st.time} onChange={(e) => setM({ ...m, stops: m.stops.map((x: any, j: number) => (j === i ? { ...x, time: e.target.value } : x)) })} />
            <TextButton tone="danger" className="pb-stack" onClick={() => setM({ ...m, stops: m.stops.filter((_: any, j: number) => j !== i) })}>Remover</TextButton>
          </div>
        ))}
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setM({ ...m, stops: [...m.stops, { fenceId: '', time: '12:00' }] })}>Adicionar parada</Button>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-small font-medium text-ink-2">Onde o veículo dorme</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{m.days.map((d: number) => <Field key={d} label={WEEKDAYS[d]}><Select value={m.sleep?.[d] || ''} onChange={(e) => setM({ ...m, sleep: { ...(m.sleep || {}), [d]: e.target.value } })} options={[{ value: '', label: '—' }, ...s.fences.map((f: any) => ({ value: f.id, label: f.name }))]} /></Field>)}</div>
      </div>
    </Modal>
  );
}
