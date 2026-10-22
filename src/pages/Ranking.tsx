import { useEffect, useState } from 'react';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Badge, Tabs, Modal, PageHeader, Check, cx, TextButton, EmptyState, ErrorState, Skeleton, IconButton, Progress, TabPanel, toast, Pills, DescList, DescRow, confirmAction, Grid, Stack } from '../components/ui';
import { PeriodCompare, presetValue, periodRanges, BI_PRESETS, type PeriodValue } from '../components/PeriodCompare';
import { KpiTile, ChartCard, DeltaChip, StatusDot, Num } from '../components/story';
import { Icon } from '../components/icons';
import { EVENT_CATEGORIES, FUTURE_CATEGORIES } from '../lib/catalog';
import { localTypes, localRanking, journeyEvents, Ranking as RankingT, EvType } from '../lib/ranking';
import { fmtD, num, toInputD, DAY } from '../lib/utils';

const PERIOD: Record<string, string> = { semana: 'semana', mes: 'mês', trimestre: 'trimestre' };

// No produto real o ranking é calculado no backend: fn_driver_ranking em docs/especificacao-sql/20261017180000_ranking.sql
async function getRanking(s: any, from: number, to: number): Promise<RankingT> {
  return localRanking(s, from, to);
}

// matriz de eventos e limite
function useMatrix() {
  const s = useStoreData();
  const cfg = s.rankCfg || { types: {}, custom: [], limit: 100, limitPeriod: 'mes' };
  return {
    types: localTypes(s), limit: cfg.limit ?? 100, limitPeriod: cfg.limitPeriod || 'mes', ready: true,
    save: async (types: EvType[], limit: number, limitPeriod: string) => s.patch((st: any) => ({ rankCfg: { ...cfg, limit, limitPeriod, types: Object.fromEntries(types.filter((t) => !t.custom).map((t) => [t.code, { weight: t.weight, tiers: t.tiers, active: t.active }])), custom: types.filter((t) => t.custom).map((t) => ({ code: t.code, label: t.label, weight: t.weight, tiers: t.tiers, active: t.active, category: 'empresa' })) }, customEventTypes: [] })),
  };
}

export default function Ranking() {
  const [tab, setTab] = useState('ranking');
  const [period, setPeriod] = useState<PeriodValue>(() => presetValue(BI_PRESETS[0], 'anterior'));
  return (
    <div>
      <PageHeader title="Ranking de motoristas" subtitle="Eventos do rastreador, telemetria, regras da empresa e jornada" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head"><Tabs value={tab} onChange={setTab} tabs={[{ key: 'ranking', label: 'Ranking' }, { key: 'matriz', label: 'Matriz de eventos e pesos' }, { key: 'campanhas', label: 'Campanhas' }]} />{tab === 'ranking' && <div className="ml-auto"><PeriodCompare value={period} onChange={setPeriod} /></div>}</div>
      <TabPanel id={tab}>
        {tab === 'ranking' && <Board period={period} />}
        {tab === 'matriz' && <Matriz />}
        {tab === 'campanhas' && <Campanhas />}
      </TabPanel>
    </div>
  );
}

const CAT_SHORT: Record<string, string> = { basico: 'Básico', telemetria: 'Telemetria/CAN', videotelemetria: 'Vídeo', jornada: 'Jornada', empresa: 'Empresa' };

function Board({ period }: { period: PeriodValue }) {
  const s = useStoreData();
  const [d, setD] = useState<{ A?: RankingT; B?: RankingT; err?: string }>({});
  const { a, b } = periodRanges(period);
  useEffect(() => {
    let alive = true;
    Promise.all([getRanking(s, a[0], a[1]), b ? getRanking(s, b[0], b[1]) : Promise.resolve(undefined)]).then(([A, B]) => alive && setD({ A, B })).catch((e) => alive && setD({ err: e.message }));
    return () => { alive = false; };
  }, [JSON.stringify(period), s.events.length, s.journey.length, JSON.stringify(s.rankCfg), JSON.stringify(s.journeyCfg)]);
  const { A, B } = d;
  const toolbar = A ? <p className="text-small text-ink-2">{`Limite de ${num(A.limit)} pontos por ${PERIOD[A.limit_period]} = ${num(A.limit_scaled, 1)} pontos neste período`}</p> : null;
  if (d.err) return <Stack gap="grid">{toolbar}<Card><ErrorState illustration="ilu-erro" layout="row" title="Não foi possível calcular o ranking" detail={d.err} /></Card></Stack>;
  if (!A) return <Stack gap="grid">{toolbar}<Card><div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div></Card></Stack>;

  const bm = Object.fromEntries((B?.drivers || []).map((x) => [x.person_id, x]));
  const att = A.drivers.filter((x) => x.attention).sort((p, q) => q.points - p.points);
  const inside = A.drivers.length - att.length;
  const attB = B ? B.drivers.filter((x) => x.attention).length : null;
  const tot = (r?: RankingT) => (r ? r.drivers.reduce((x, y) => x + y.points, 0) : null);
  const km = (r?: RankingT) => (r ? r.drivers.reduce((x, y) => x + y.km, 0) : 0);
  const per100 = (r?: RankingT) => (r && km(r) > 0 ? tot(r)! / (km(r) / 100) : null);
  const rel = (x: number | null, y: number | null) => (x == null || y == null || !y ? null : ((x - y) / y) * 100);
  // destaques educativos: os melhores do período e quem mais reduziu pontos
  const best = A.drivers.slice(0, 3);
  const improved = B ? A.drivers.map((x) => ({ x, diff: bm[x.person_id] ? x.points - bm[x.person_id].points : 0 })).filter((r) => r.diff < 0).sort((p, q) => p.diff - q.diff).slice(0, 3) : [];
  const zero = A.drivers.filter((x) => x.points === 0).length;
  const campaigns = (s.campaigns || []).filter((c: any) => new Date(c.to + 'T23:59').getTime() >= Date.now() && new Date(c.from + 'T00:00').getTime() <= Date.now());
  const fleetSentence = `${inside} de ${A.drivers.length} motoristas dentro do limite${zero ? `; ${zero} sem nenhum ponto no período` : ''}${att.length ? `. ${att.length === 1 ? `${att[0].name} está` : `${att.length} motoristas estão`} em atenção.` : '.'}`;

  return (
    <Stack gap="grid">
      {toolbar}
      <Grid cols={4} equal>
        <KpiTile label="Dentro do limite" value={inside} sub={`de ${A.drivers.length} motoristas`} delta={{ value: B ? inside - (B.drivers.length - attB!) : null, unit: '', digits: 0, good: 'up' }} />
        <KpiTile label="Em atenção" value={att.length} status={att.length ? 'parado' : undefined} delta={{ value: attB != null ? att.length - attB : null, unit: '', digits: 0, good: 'down' }} sub={`Acima de ${num(A.limit_scaled, 1)} pontos`} />
        <KpiTile label="Pontos da frota" value={tot(A)} delta={{ value: rel(tot(A), tot(B)), unit: '%', good: 'down' }} sub={`${num(A.drivers.reduce((x, y) => x + y.events, 0))} eventos`} />
        <KpiTile label="Pontos a cada 100 km" value={per100(A)} digits={1} delta={{ value: rel(per100(A), per100(B)), unit: '%', good: 'down' }} sub={<><Num value={km(A)} unit="km" size="small" /> rodados</>} />
      </Grid>
      <Grid cols={2} wide equal>
        <ChartCard title="Destaques do período" icon="trofeu" sentence={fleetSentence}>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <p className="text-caption text-ink-2 mb-2">Menos pontos</p>
              <ol className="flex flex-col gap-stack">{best.map((x, i) => <li key={x.person_id} className="flex items-baseline gap-3"><span className="num text-ink-2 w-4">{i + 1}</span><span className="font-medium mr-auto">{x.name}</span><span className="num text-small text-ink-2">{num(x.points)} pts</span></li>)}</ol>
            </div>
            <div>
              <p className="text-caption text-ink-2 mb-2">Quem mais reduziu</p>
              {improved.length ? <ol className="flex flex-col gap-stack">{improved.map((r) => <li key={r.x.person_id} className="flex items-baseline gap-3"><span className="font-medium mr-auto">{r.x.name}</span><DeltaChip value={r.diff} unit="pts" digits={0} good="down" /></li>)}</ol>
                : <p className="text-small text-ink-2">{B ? 'Ninguém reduziu pontos em relação ao período anterior.' : 'Ative a comparação de período para ver a evolução.'}</p>}
            </div>
          </div>
          {campaigns.length > 0 && <p className="text-caption text-ink-2 mt-5 pt-4 border-t border-line">Campanhas em andamento: {campaigns.map((c: any) => c.name).join(' · ')}</p>}
        </ChartCard>
        <Card title={<span className="inline-flex items-center gap-2"><StatusDot kind="parado" label="Em atenção" className="text-h3 font-semibold" /><span className="text-small font-normal text-ink-2 num">{att.length}</span></span>}>
          <p className="text-small text-ink-2 mb-4">Acima de {num(A.limit_scaled, 1)} pontos no período, com os eventos que mais pesaram. O objetivo é orientar a correção.</p>
          {att.length === 0 ? <EmptyState illustration="ilu-tudo-em-dia" title="Ninguém acima do limite" /> : (
            <ul className="flex flex-col gap-4">
              {att.map((x) => (
                <li key={x.person_id} className="pt-4 border-t border-line first:border-t-0 first:pt-0">
                  <div className="flex items-baseline gap-2 mb-2"><span className="font-medium mr-auto">{x.name}</span><span className="num text-small font-semibold">{num(x.points)} pts</span><span className="text-caption text-ink-2 num">· {num((x.points / A.limit_scaled) * 100)}% do limite</span></div>
                  <ul className="flex flex-col gap-tight">{x.by_code.slice(0, 4).map((bc) => <li key={bc.code} className="grid grid-cols-[minmax(0,1fr)_7rem_4.5rem] items-center gap-3 text-small"><span className="truncate">{bc.label} <span className="text-ink-2">· {bc.qty}× · {CAT_SHORT[bc.category] || bc.category}</span></span><Progress value={bc.points / x.points} color="var(--real)" label={`${bc.label}: ${num(bc.points)} pontos`} /><span className="num text-right">{num(bc.points)} pts</span></li>)}</ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Grid>
      <Card title="Classificação" icon="ranking">
        <p className="text-small text-ink-2 mb-3">Menos pontos é melhor. A barra mostra os pontos em relação ao limite do período.</p>
        <Table minWidth={980} align={['right', 'left', 'left', 'left', 'right', 'right', ...(B ? ['right' as const] : []), 'left']} head={['#', 'Motorista', 'Pontos', 'Situação', 'Eventos', 'Pontos/100 km', ...(B ? ['Variação'] : []), 'Eventos que mais pesaram']} rows={A.drivers.map((x, i) => [
          <span className="num text-ink-2">{i + 1}</span>, <span className="font-medium">{x.name}</span>,
          <div className="flex items-center gap-2 min-w-[160px]"><Progress className="h-2 flex-1" value={Math.min(1, x.points / Math.max(A.limit_scaled, 1))} color={x.attention ? 'var(--warn)' : 'var(--real)'} label={`${num(x.points)} de ${num(A.limit_scaled, 1)} pontos`} /><span className="num w-10 text-right">{num(x.points)}</span></div>,
          x.attention ? <StatusDot kind="parado" label="Em atenção" /> : <span className="text-ink-2 text-small">Dentro do limite</span>, <span className="num">{x.events}</span>, x.points_per_100km != null ? <Num value={x.points_per_100km} digits={2} size="body" /> : '—',
          ...(B ? [bm[x.person_id] ? <DeltaChip value={x.points - bm[x.person_id].points} unit="pts" digits={0} good="down" size="sm" /> : '—'] : []),
          <span className="text-caption text-ink-2">{x.by_code.slice(0, 3).map((bc) => `${bc.label} ${num(bc.points)}`).join(' · ') || '—'}</span>])} />
      </Card>
    </Stack>
  );
}

function Matriz() {
  const s = useStoreData();
  const M = useMatrix();
  const [types, setTypes] = useState<EvType[]>([]);
  const [limit, setLimit] = useState(100);
  const [lp, setLp] = useState('mes');
  const [n, setN] = useState({ label: '', weight: 2 });
  useEffect(() => { if (M.ready) { setTypes(M.types.map((t) => ({ ...t, tiers: [...t.tiers] }))); setLimit(M.limit); setLp(M.limitPeriod); } }, [M.ready, JSON.stringify(M.types), M.limit, M.limitPeriod]);
  const up = (code: string, p: Partial<EvType>) => { setTypes(types.map((t) => (t.code === code ? { ...t, ...p } : t))); };
  const save = async () => { try { await M.save(types, limit, lp); toast('Matriz salva.'); } catch (e: any) { toast('Não foi possível salvar a matriz.', { tone: 'crit', detail: e.message }); } };
  const cats = Object.keys(EVENT_CATEGORIES).filter((c) => !FUTURE_CATEGORIES.includes(c));
  return (
    <Stack gap="grid">
      <Card title="Limite de pontos" icon="alvo">
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Limite"><Input className="w-28" type="number" value={limit} onChange={(e) => setLimit(+e.target.value)} /></Field>
          <Field label="Por"><Select className="w-36" value={lp} onChange={(e) => setLp(e.target.value)} options={[{ value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }, { value: 'trimestre', label: 'Trimestre' }]} /></Field>
          <p className="text-small text-ink-2 pb-2 max-w-xl">Quem passar do limite fica "em atenção". Em períodos diferentes, o limite é proporcional (ex.: 100 por mês = 50 em 15 dias).</p>
        </div>
      </Card>
      <Card title="Matriz de eventos × pesos" icon="config" actions={<Button onClick={save}>Salvar matriz</Button>}>
        <p className="text-small text-ink-2 mb-3">Cada ocorrência soma o peso do evento. Com faixas, vale o peso da maior faixa atingida pelo valor medido (ex.: excesso de velocidade a 104 km/h usa a faixa "a partir de 100").</p>
        {cats.map((c) => {
          const rows = types.filter((t) => t.category === c);
          if (!rows.length) return null;
          return (
            <div key={c} className="mb-5">
              <div className="text-small font-medium text-ink-2 mb-2">{EVENT_CATEGORIES[c]}{c === 'jornada' && <span className="font-normal text-ink-2"> · infrações apuradas com os limites da empresa (Jornada › Regras)</span>}</div>
              <Table minWidth={860} head={['Evento', 'Peso base', 'Faixas pelo valor medido', 'Ativo']} rows={rows.map((t) => [
                <div><span className="font-medium">{t.label}</span>{t.requiresCan && <span className="ml-2 text-caption text-ink-2">· requer CAN</span>}<div className="text-caption text-ink-2"><span className="font-mono">{t.code}</span>{t.unit ? ` · valor em ${t.unit}` : ''}</div></div>,
                <Input className="w-20" type="number" aria-label={`Peso ${t.label}`} value={t.weight} onChange={(e) => up(t.code, { weight: +e.target.value })} />,
                <div className="flex flex-wrap gap-2 items-center">
                  {t.tiers.map((tr, i) => <span key={i} className="flex items-center gap-tight bg-surface-muted rounded-ctl pl-stack pr-1 py-1 text-caption font-medium">a partir de<Input aria-label="Valor mínimo" className="!w-16 !h-8 !px-tight text-small num" type="number" value={tr.min} onChange={(e) => up(t.code, { tiers: t.tiers.map((x, j) => (j === i ? { ...x, min: +e.target.value } : x)) })} />{t.unit}: peso<Input aria-label="Peso da faixa" className="!w-14 !h-8 !px-tight text-small num" type="number" value={tr.weight} onChange={(e) => up(t.code, { tiers: t.tiers.map((x, j) => (j === i ? { ...x, weight: +e.target.value } : x)) })} /><IconButton aria-label="Remover faixa" size="sm" onClick={() => up(t.code, { tiers: t.tiers.filter((_, j) => j !== i) })}><Icon name="fechar" size={14} /></IconButton></span>)}
                  {t.unit && <TextButton onClick={() => up(t.code, { tiers: [...t.tiers, { min: (t.tiers[t.tiers.length - 1]?.min || 0) + 10, weight: t.weight + 2 }] })}>+ faixa</TextButton>}
                  {!t.unit && !t.tiers.length && <span className="text-caption text-ink-2">sem faixas (peso fixo)</span>}
                </div>,
                <Check aria-label={`${t.label} ativo`} checked={t.active} onChange={(v) => up(t.code, { active: v })} />])} />
            </div>
          );
        })}
        <div className="flex gap-2 items-end mt-2 max-w-xl"><Field label="Novo evento da empresa" className="flex-1"><Input value={n.label} onChange={(e) => setN({ ...n, label: e.target.value })} placeholder="Ex.: Atraso na entrega" /></Field><Field label="Peso"><Input className="w-20" type="number" value={n.weight} onChange={(e) => setN({ ...n, weight: +e.target.value })} /></Field><Button variant="secondary" disabled={!n.label} onClick={() => { setTypes([...types, { code: 'custom_' + Date.now(), label: n.label, category: 'empresa', weight: n.weight, tiers: [], active: true, custom: true }]); setN({ label: '', weight: 2 }); }}>Adicionar</Button></div>
        <p className="text-caption text-ink-2 mt-2">Eventos de telemetria (RPM excessivo, banguela) só chegam de veículos com leitura CAN — marque em Gestão de ativos. Na simulação, KOZ5H91 e PEW1A33 têm CAN.</p>
      </Card>
      <RegisterEvent types={types} />
    </Stack>
  );
}

function RegisterEvent({ types }: { types: EvType[] }) {
  const s = useStoreData();
  const [e, setE] = useState({ driverId: s.drivers[0].id, type: 'excesso_velocidade', value: '' });
  const t = types.find((x) => x.code === e.type);
  return (
    <Card title="Lançar evento manualmente" icon="mais">
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="Motorista"><SearchSelect className="w-48" value={e.driverId} onChange={(v) => setE({ ...e, driverId: v })} options={s.drivers.map((d: any) => ({ value: d.id, label: d.name }))} /></Field>
        <Field label="Evento"><Select className="w-64" value={e.type} onChange={(x) => setE({ ...e, type: x.target.value })} options={types.filter((x) => x.active).map((x) => ({ value: x.code, label: x.label }))} /></Field>
        {t?.unit && <Field label={`Valor (${t.unit})`}><Input className="w-28" type="number" value={e.value} onChange={(x) => setE({ ...e, value: x.target.value })} /></Field>}
        <Button variant="dark" onClick={() => { s.upsert('events', { driverId: e.driverId, type: e.type, ts: Date.now(), assetId: s.assets.find((a: any) => a.driverId === e.driverId)?.id, value: e.value ? +e.value : null, source: 'manual', pos: [-8.1, -34.92] }); toast('Evento lançado.'); setE({ ...e, value: '' }); }}>Lançar</Button>
      </div>
    </Card>
  );
}

// Campanhas: foco educativo e de premiação. Meta (até N eventos) ou tolerância zero, para qualquer evento:
// rastreador, telemetria, regras da empresa e jornada. Conta por motorista, que é quem recebe o prêmio.
function Campanhas() {
  const s = useStoreData();
  const T = Object.fromEntries(localTypes(s).map((t) => [t.code, t]));
  const [c, setC] = useState<any>(null);
  const all = [...s.events, ...journeyEvents(s)];
  const cats = Object.keys(EVENT_CATEGORIES).filter((c) => !FUTURE_CATEGORIES.includes(c));
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <p className="text-small text-ink-2 mr-auto max-w-[80ch]">Campanhas premiam quem cumpre a meta no período. Valem para qualquer evento do ranking, inclusive jornada e regras da empresa.</p>
        <Button onClick={() => setC({ name: '', from: toInputD(Date.now()), to: toInputD(Date.now() + 30 * DAY), eventTypes: ['excesso_velocidade'], maxPerVehicle: 0, prize: '', groupId: '' })}><Icon name="mais" size={16} />Nova campanha</Button>
      </div>
      <Grid cols={2} wide equal>
        {s.campaigns.length === 0 &&<Card className="xl:col-span-2"><EmptyState illustration="ilu-campanhas" layout="row" title="Nenhuma campanha" detail="Crie uma campanha com meta ou tolerância zero e uma premiação." /></Card>}
        {s.campaigns.map((cp: any) => {
          const f = new Date(cp.from + 'T00:00').getTime(), t = new Date(cp.to + 'T23:59').getTime();
          const drivers = s.drivers.filter((d: any) => !cp.groupId || s.assets.some((a: any) => a.driverId === d.id && a.groupIds?.includes(cp.groupId)));
          const rows = drivers.map((d: any) => { const n = all.filter((e: any) => e.driverId === d.id && cp.eventTypes.includes(e.type) && e.ts >= f && e.ts <= t).length; return { d, n, ok: n <= cp.maxPerVehicle }; }).sort((x: any, y: any) => x.n - y.n);
          const ok = rows.filter((r: any) => r.ok).length;
          const now = Date.now(); const done = now > t; const days = Math.max(0, Math.ceil((t - now) / DAY));
          const elapsed = Math.min(1, Math.max(0, (now - f) / (t - f)));
          const zero = +cp.maxPerVehicle === 0;
          return (
            <Card key={cp.id} title={cp.name} icon="trofeu" actions={<div className="flex gap-3"><TextButton onClick={() => setC({ ...cp })}>Editar</TextButton><TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir a campanha "${cp.name}"?`, detail: 'O ranking da campanha e as premiações calculadas deixam de aparecer.' })) { s.remove('campaigns', cp.id); toast('Campanha excluída.', { action: { label: 'Desfazer', onClick: () => s.upsert('campaigns', cp) } }); } }}>Excluir</TextButton></div>}>
              <DescList className="mb-4">
                <DescRow label="Período"><span className="num">{fmtD(cp.from + 'T00:00')} a {fmtD(cp.to + 'T00:00')}</span> · {done ? 'encerrada' : now < f ? 'ainda não começou' : `faltam ${days} dias`}</DescRow>
                <DescRow label="Meta">{zero ? 'Tolerância zero: nenhum evento' : `Até ${cp.maxPerVehicle} eventos por motorista`}</DescRow>
                <DescRow label="Eventos">{cp.eventTypes.map((e: string) => T[e]?.label || e).join(', ')}</DescRow>
                {cp.prize && <DescRow label="Premiação">{cp.prize}</DescRow>}
              </DescList>
              <div className="flex items-baseline gap-2 mb-tight"><Num value={ok} size="lg" /><span className="text-small text-ink-2">de {rows.length} motoristas {done ? 'cumpriram a meta' : 'dentro da meta até agora'}</span></div>
              <Progress value={rows.length ? ok / rows.length : 0} color="var(--real)" label={`${ok} de ${rows.length} dentro da meta`} />
              {!done && <p className="text-caption text-ink-2 mt-1 num">{num(elapsed * 100)}% do período decorrido</p>}
              <ul className="flex flex-col mt-4">
                {rows.map((r: any) => <li key={r.d.id} className="flex items-center gap-3 py-2 border-t border-line first:border-t-0 text-body"><span className="mr-auto">{r.d.name}</span><span className="num text-ink-2">{r.n} {r.n === 1 ? 'evento' : 'eventos'}</span>{r.ok ? <span className="text-ink-2 text-small w-36 text-right">{done ? 'Cumpriu' : 'Dentro da meta'}</span> : <span className="w-36 text-right"><StatusDot kind="parado" label="Passou da meta" className="justify-end" /></span>}</li>)}
              </ul>
            </Card>
          );
        })}
      </Grid>
      <Modal open={!!c} onClose={() => setC(null)} title={c?.id ? 'Editar campanha' : 'Nova campanha'} width="max-w-2xl" footer={<><Button variant="quiet" onClick={() => setC(null)}>Cancelar</Button><Button disabled={!c?.name || !c?.eventTypes.length} onClick={() => { s.upsert('campaigns', { ...c, maxPerVehicle: +c.maxPerVehicle }); setC(null); toast('Campanha salva.'); }}>Salvar campanha</Button></>}>
        {c && <>
          <Field label="Nome"><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Ex.: Almoço no horário em novembro" /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-field"><Field label="Início"><Input type="date" value={c.from} onChange={(e) => setC({ ...c, from: e.target.value })} /></Field><Field label="Fim"><Input type="date" value={c.to} onChange={(e) => setC({ ...c, to: e.target.value })} /></Field></div>
          <Field label="Meta"><Pills value={+c.maxPerVehicle === 0 ? 'zero' : 'meta'} onChange={(k) => setC({ ...c, maxPerVehicle: k === 'zero' ? 0 : Math.max(1, +c.maxPerVehicle || 3) })} options={[{ key: 'zero', label: 'Tolerância zero' }, { key: 'meta', label: 'Até N eventos' }]} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
            {+c.maxPerVehicle > 0 && <Field label="Máximo de eventos por motorista"><Input type="number" min={1} value={c.maxPerVehicle} onChange={(e) => setC({ ...c, maxPerVehicle: e.target.value })} /></Field>}
            <Field label="Grupo"><Select value={c.groupId} onChange={(e) => setC({ ...c, groupId: e.target.value })} options={[{ value: '', label: 'Todos' }, ...s.groups.map((g: any) => ({ value: g.id, label: g.name }))]} /></Field>
          </div>
          <span className="text-small font-medium text-ink-2">Eventos que participam</span>
          {cats.map((k) => { const list = Object.values(T).filter((v: any) => v.category === k); if (!list.length) return null; return <div key={k}><p className="text-caption text-ink-2 mb-1">{EVENT_CATEGORIES[k]}</p><div className="flex flex-wrap gap-x-4 gap-y-2">{list.map((v: any) => <Check key={v.code} label={v.label} checked={c.eventTypes.includes(v.code)} onChange={(on) => setC({ ...c, eventTypes: on ? [...c.eventTypes, v.code] : c.eventTypes.filter((x: string) => x !== v.code) })} />)}</div></div>; })}
          <Field label="Premiação"><Input value={c.prize} onChange={(e) => setC({ ...c, prize: e.target.value })} placeholder="Ex.: Vale-combustível de R$ 200" /></Field>
        </>}
      </Modal>
    </>
  );
}
