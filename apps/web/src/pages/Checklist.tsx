import { RetiredToggle } from '../components/RetiredToggle';
import { opAssets } from '../lib/assetLifecycle';
import { auditEntry } from '@localle/shared/audit';
import { useEffect, useMemo, useState } from 'react';
import { useStore, useStoreData } from '../lib/store';
import { salvarOs } from '../lib/localleApi';
import { assetKm } from '@localle/shared/km';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Badge, Tabs, Modal, PageHeader, FilePick, EmptyState, ErrorState, Skeleton, Check, Textarea, cx, TextButton, Callout, Panel, IconButton, FilterChip, DescList, DescRow, confirmAction, toast, Grid, Stack } from '../components/ui';
import { Dropzone } from '../components/Dropzone';
import { PeriodCompare, presetValue, periodRanges, BI_PRESETS, type PeriodValue } from '../components/PeriodCompare';
import { Icon } from '../components/icons';
import { KpiTile, ChartCard, DeltaChip, AssetName } from '../components/story';
import { ChartLegend, FILL, CATS, TipItem } from '../components/charts';
import { CkProvider, useCk } from '../lib/checklistRepo';
import { QTYPES, SCHED, ROLES, WD, occurrences, isFlagged, ChecklistBi } from '@localle/shared/checklist';
import { fmtD, fmtDT, num, pct, DAY, MIN, startOfDay, toInputD, toInputDT, uid, isPlate } from '@localle/shared/utils';
import { Link } from 'react-router-dom';

export { occurrences };

export default function Checklist() { return <CkProvider><Inner /></CkProvider>; }

function Inner() {
  const [tab, setTab] = useState('bi');
  const R = useCk();
  const [period, setPeriod] = useState<PeriodValue>(() => presetValue(BI_PRESETS[0], 'anterior'));
  return (
    <div>
      <PageHeader icon="checklist" title="Checklist" subtitle="Modelos, grupos de respondentes, adesão e painel de respostas" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head"><RetiredToggle /><Tabs value={tab} onChange={setTab} tabs={[{ key: 'bi', label: 'BI e adesão' }, { key: 'modelos', label: 'Modelos' }, { key: 'grupos', label: 'Grupos e pessoas' }, { key: 'preencher', label: 'Preencher (app)' }, { key: 'respostas', label: 'Respostas' }]} />{tab === 'bi' && <div className="ml-auto"><PeriodCompare value={period} onChange={setPeriod} /></div>}</div>
      {R.error && <Callout tone="crit" className="mb-card-head">{R.error}</Callout>}
      {tab === 'bi' && <BI period={period} />}
      {tab === 'modelos' && <Modelos />}
      {tab === 'grupos' && <Grupos />}
      {tab === 'preencher' && <Preencher onDone={() => setTab('respostas')} />}
      {tab === 'respostas' && <Respostas />}
    </div>
  );
}

const resolveGroup = (g: any, people: any[]) => people.filter((p) => (g.ruleCnh || []).includes(p.cnhCat) || (g.ruleRoles || []).includes(p.role) || (g.memberIds || []).includes(p.id));
const fmtS = (s: number | null) => (s == null ? '—' : num(s / 60, 1) + ' min');

// ---------- BI ----------
// Pedido da reunião: adesão (previstos × preenchidos) por pessoa, grupo e periodicidade,
// tempo médio de preenchimento e painel das respostas mais frequentes. Tudo com comparação de período.
// Metas: parâmetros do Setup "checklist.meta_adesao" e "checklist.meta_tempo_min" (camada cliente; Locale e revenda definem o padrão).
const LOW = 0.85; // meta de adesão: abaixo dela pede atenção
const TIME_GOAL_MIN = 8; // meta de tempo médio de preenchimento
interface AdhRow { key: string; label: string; sub?: string; expected: number; done: number; adherence: number | null; prev?: number | null }
const ppDelta = (a?: number | null, b?: number | null) => (a == null || b == null ? null : (a - b) * 100);
const byKey = <T,>(arr: T[] | undefined, k: (x: T) => string): Record<string, T> => Object.fromEntries((arr || []).map((x) => [k(x), x]));

// previstos × preenchidos: barra = feitos / previstos; traço = adesão no período de comparação
function AdhBars({ rows }: { rows: AdhRow[] }) {
  return (
    <ul className="flex flex-col gap-stack">
      {rows.map((r, i) => (
        <TipItem title={r.label} rows={[{ label: 'Preenchidos', value: `${r.done} de ${r.expected}`, strong: true }, { label: 'Adesão', value: r.adherence == null ? '—' : pct(r.adherence, 0) }, ...(r.prev != null ? [{ label: 'Período anterior', value: pct(r.prev, 0), tone: 'muted' as const }] : [])]} key={r.key} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3">
          <span className="min-w-0"><span className="block text-body font-medium truncate">{r.label}</span>{r.sub && <span className="block text-caption text-ink-2 truncate">{r.sub}</span>}</span>
          <span className="relative h-2.5 rounded-pill bg-track" title={`${r.done} de ${r.expected} previstos`}>
            <span className={cx('block h-full rounded-pill grow-x', (r.adherence ?? 1) < LOW ? 'fill-loss' : 'fill-real')} style={{ width: `${(r.adherence || 0) * 100}%`, ['--i' as any]: i }} />
            {r.prev != null && <span aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 rounded-pill bg-ink" style={{ left: `calc(${r.prev * 100}% - 1px)` }} />}
          </span>
          <span className="text-right whitespace-nowrap min-w-[9rem]">
            <span className="text-body num font-medium">{r.adherence == null ? '—' : pct(r.adherence, 0)}</span>
            <span className="text-caption text-ink-2 num"> · {r.done} de {r.expected}</span>
            {r.prev != null && <span className="block"><DeltaChip value={ppDelta(r.adherence, r.prev)} digits={0} /></span>}
          </span>
        </TipItem>
      ))}
    </ul>
  );
}

// traço do período anterior usado nas barras do BI
const PrevMark = () => <span className="text-caption text-ink-2 inline-flex items-center gap-tight"><span aria-hidden="true" className="w-0.5 h-3 rounded-pill bg-ink" />Período anterior</span>;

function BI({ period }: { period: PeriodValue }) {
  const R = useCk();
  const [dim, setDim] = useState('pessoa');
  const [tdim, setTdim] = useState('modelo');
  const [allQ, setAllQ] = useState(false);
  const [d, setD] = useState<{ A?: ChecklistBi; B?: ChecklistBi; err?: string }>({});
  const s = useStoreData();
  const [sent, setSent] = useState<Record<string, number>>({});
  const { a, b } = periodRanges(period);
  // lembrete simulado (na demo fica registrado; em produção vai por notificação do app ou WhatsApp)
  const remind = (persons: string[]) => { const now = Date.now(); s.patch((st: any) => ({ reminders: [...persons.map((p) => ({ id: uid('lb'), ts: now, person: p, origin: 'checklist' })), ...(st.reminders || [])].slice(0, 300), ...(persons.length > 1 ? auditEntry(st, { coll: 'checklist', refId: '', label: 'Lembrete de checklist', action: `enviou lembrete a ${persons.length} pessoas em lote`, count: persons.length }) : {}) })); setSent((x) => ({ ...x, ...Object.fromEntries(persons.map((p) => [p, now])) })); };
  // OS corretiva a partir de uma resposta não conforme, com o veículo e o item preenchidos
  const osFrom = (key: string) => s.workOrders.find((w: any) => w.fromChecklist === key);
  const openOs = (key: string, q: any, r: any, value: string) => {
    salvarOs({ type: 'corretiva', assetId: r.assetId, services: [], items: [{ id: uid('it'), label: `${q.label}: ${value}`, est: null, real: null, done: false }], title: `${q.label}: ${value}`, description: `Não conformidade apontada no checklist "${q.template}" em ${fmtDT(r.finishedAt)}.`, status: 'aberta', unplanned: false, openedAt: Date.now(), odometerAt: 0, quotes: [], evidences: r.answers?.[q.question_id]?.photo ? [{ id: uid('ev'), kind: 'foto', data: r.answers[q.question_id].photo, name: 'Foto do checklist' }] : [], comments: [], nf: { chave: '', numero: '', valor: 0, erp: 'nenhum' }, fromChecklist: key }).catch((e: any) => toast('Não foi possível abrir a OS: ' + (e.message || e), { tone: 'crit' }));
  };
  useEffect(() => {
    let alive = true;
    Promise.all([R.bi(a[0], a[1]), b ? R.bi(b[0], b[1]) : Promise.resolve(undefined)]).then(([A, B]) => alive && setD({ A, B })).catch((e) => alive && setD({ err: e.message }));
    return () => { alive = false; };
  }, [JSON.stringify(period), R.responses.length, R.templates.length]);
  const { A, B } = d;
  const adh = (k?: ChecklistBi) => (k && k.expected ? k.done / k.expected : null);
  const avar = (k?: ChecklistBi) => (k && k.assets_checked ? k.assets_flagged / k.assets_checked : null);
  const toolbar = <p className="text-small text-ink-2">{R.remote ? 'Calculado no Supabase' : 'Calculado sobre os dados da simulação'}</p>;
  if (d.err) return <Stack gap="grid">{toolbar}<Card><ErrorState illustration="ilu-erro" layout="row" title="Não foi possível calcular o BI" detail={d.err} /></Card></Stack>;
  if (!A) return <Stack gap="grid">{toolbar}<Card><div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div></Card></Stack>;

  // adesão por dimensão (pior primeiro)
  const rowsBy: Record<string, AdhRow[]> = {
    pessoa: A.by_person.map((x) => ({ key: x.person_id, label: x.name, sub: ROLES[x.role] || x.role, expected: x.expected, done: x.done, adherence: x.adherence, prev: byKey(B?.by_person, (y) => y.person_id)[x.person_id]?.adherence })),
    grupo: A.by_group.map((x) => ({ key: x.group_id, label: x.name, expected: x.expected, done: x.done, adherence: x.adherence, prev: byKey(B?.by_group, (y) => y.group_id)[x.group_id]?.adherence })),
    periodicidade: A.by_schedule.map((x) => ({ key: x.schedule, label: SCHED[x.schedule] || x.schedule, expected: x.expected, done: x.done, adherence: x.adherence, prev: byKey(B?.by_schedule, (y) => y.schedule)[x.schedule]?.adherence })),
    modelo: A.by_template.map((x) => ({ key: x.template_id, label: x.name, sub: SCHED[x.schedule], expected: x.expected, done: x.done, adherence: x.adherence, prev: byKey(B?.by_template, (y) => y.template_id)[x.template_id]?.adherence })),
  };
  const rows = rowsBy[dim].filter((r) => r.expected).sort((x, y) => (x.adherence ?? 1) - (y.adherence ?? 1));
  const plural: Record<string, string> = { pessoa: 'pessoas', grupo: 'grupos', periodicidade: 'periodicidades', modelo: 'modelos' };
  const low = rows.filter((r) => (r.adherence ?? 1) < LOW);
  const adhSentence = !rows.length ? 'Nenhum checklist previsto no período.'
    : !low.length ? `${rows.length === 1 ? 'O único item está' : `Todos os ${rows.length} ${plural[dim]} estão`} acima de ${pct(LOW, 0)} de adesão.`
    : `${low.length} de ${rows.length} ${plural[dim]} abaixo de ${pct(LOW, 0)}; a menor adesão é de ${rows[0].label} (${pct(rows[0].adherence || 0, 0)}), com ${rows[0].expected - rows[0].done} checklists não lançados.`;

  // tempo médio de preenchimento
  const tRows = (tdim === 'modelo'
    ? A.by_template.map((x) => ({ key: x.template_id, label: x.name, sub: SCHED[x.schedule], s: x.avg_fill_s, prev: byKey(B?.by_template, (y) => y.template_id)[x.template_id]?.avg_fill_s ?? null }))
    : A.by_person.map((x) => ({ key: x.person_id, label: x.name, sub: ROLES[x.role] || x.role, s: x.avg_fill_s, prev: byKey(B?.by_person, (y) => y.person_id)[x.person_id]?.avg_fill_s ?? null })))
    .filter((x) => x.s != null).sort((x, y) => (y.s || 0) - (x.s || 0));
  const maxS = Math.max(60, ...tRows.map((x) => Math.max(x.s || 0, x.prev || 0)));
  const slow = tRows[0];
  const timeSentence = !slow ? 'Nenhuma resposta no período.' : `${tdim === 'modelo' ? 'O checklist mais demorado é' : 'Quem mais demora é'} ${slow.label} (${fmtS(slow.s)} em média); a média geral é ${fmtS(A.avg_fill_s)}${(() => { const over = tRows.filter((x) => (x.s || 0) / 60 > TIME_GOAL_MIN).length; return over ? `, e ${over} ${over > 1 ? 'passam' : 'passa'} da meta de ${TIME_GOAL_MIN} min` : `, dentro da meta de ${TIME_GOAL_MIN} min`; })()}.`;

  // painel das respostas: o que mais aparece e quanto indica problema
  const bq = byKey(B?.questions, (y) => y.question_id);
  const qDefs = byKey(R.templates.flatMap((t: any) => t.questions.map((q: any) => ({ ...q, tpl: t.name }))), (q: any) => q.tpl + '|' + q.id);
  const qs = A.questions.filter((q) => q.answers && q.values?.length);
  const shownQ = allQ ? qs : qs.slice(0, 6);
  const topQ = qs[0];
  const ansSentence = !qs.length ? 'Sem respostas no período.'
    : `${A.assets_flagged} de ${A.assets_checked} veículos vistoriados tiveram algum problema apontado${topQ?.flag_rate ? `; o item com mais problema é "${topQ.label}" (${pct(topQ.flag_rate, 0)} das respostas)` : ''}.`;

  // quem não lançou, agrupado por pessoa e checklist
  const missMap: Record<string, { person: string; template: string; n: number; last: string }> = {};
  for (const x of A.missing) { const k = x.person + '|' + x.template; const m = (missMap[k] ||= { person: x.person, template: x.template, n: 0, last: x.date }); m.n++; if (x.date > m.last) m.last = x.date; }
  const miss = Object.values(missMap).sort((x, y) => y.n - x.n);

  return (
    <Stack gap="grid">
      {toolbar}
      <Grid cols={4} equal>
        <KpiTile label="Adesão ao preenchimento" value={adh(A) != null ? adh(A)! * 100 : null} unit="%" digits={1} status={(adh(A) ?? 1) < LOW ? 'parado' : undefined} delta={{ value: ppDelta(adh(A), adh(B)), good: 'up' }} sub={`${num(A.done)} de ${num(A.expected)} previstos`} />
        <KpiTile label="Tempo médio de preenchimento" value={A.avg_fill_s != null ? A.avg_fill_s / 60 : null} unit="min" digits={1} status={(A.avg_fill_s ?? 0) / 60 > TIME_GOAL_MIN ? 'parado' : undefined} delta={{ value: A.avg_fill_s != null && B?.avg_fill_s != null ? (A.avg_fill_s - B.avg_fill_s) / 60 : null, unit: 'min', good: 'down' }} sub={`Meta até ${TIME_GOAL_MIN} min · ${num(A.responses)} respostas`} />
        <KpiTile label="Veículos com problema apontado" value={avar(A) != null ? avar(A)! * 100 : null} unit="%" status={(avar(A) ?? 0) > 0.2 ? 'parado' : undefined} delta={{ value: ppDelta(avar(A), avar(B)), good: 'down' }} sub={`${A.assets_flagged} de ${A.assets_checked} veículos vistoriados`} />
        <KpiTile label="Checklists não lançados" value={A.expected - A.done} delta={{ value: B ? A.expected - A.done - (B.expected - B.done) : null, unit: '', digits: 0, good: 'down' }} sub="Previstos sem resposta no prazo" />
      </Grid>
      <Grid split="7/5" wide equal>
        <ChartCard title="Adesão: previstos × preenchidos" icon="checklist" sentence={adhSentence}
          aside={<ChartLegend items={[{ kind: 'real', label: 'Preenchidos' }, { kind: 'loss', label: `Abaixo de ${pct(LOW, 0)}` }]} />}
          state={rows.length ? 'ready' : 'empty'} empty={{ title: dim === 'grupo' ? 'Nenhum modelo atribuído a grupos' : 'Nenhum checklist previsto', detail: dim === 'grupo' ? 'Atribua modelos a grupos de respondentes na aba Modelos.' : undefined }}>
          <div className="flex flex-wrap items-center gap-3 mb-4"><Tabs value={dim} onChange={setDim} tabs={[{ key: 'pessoa', label: 'Pessoa' }, { key: 'grupo', label: 'Grupo' }, { key: 'periodicidade', label: 'Periodicidade' }, { key: 'modelo', label: 'Modelo' }]} />{B && <PrevMark />}</div>
          <AdhBars rows={rows} />
        </ChartCard>
        <ChartCard title="Tempo médio de preenchimento" icon="relogio" sentence={timeSentence} state={tRows.length ? 'ready' : 'empty'} empty={{ title: 'Nenhuma resposta no período' }}>
          <div className="flex flex-wrap items-center gap-3 mb-4"><Tabs value={tdim} onChange={setTdim} tabs={[{ key: 'modelo', label: 'Modelo' }, { key: 'pessoa', label: 'Pessoa' }]} />{B && <PrevMark />}</div>
          <ul className="flex flex-col gap-3">
            {tRows.map((x, i) => (
              <TipItem title={x.label} rows={[{ label: 'Tempo médio', value: fmtS(x.s), strong: true }, ...(x.prev != null ? [{ label: 'Período anterior', value: fmtS(x.prev), tone: 'muted' as const }] : [])]} foot={`Meta: até ${TIME_GOAL_MIN} min`} key={x.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
                <span className="min-w-0"><span className="block text-body font-medium truncate">{x.label}</span>{x.sub && <span className="block text-caption text-ink-2 truncate">{x.sub}</span>}</span>
                <span className="relative h-2.5 rounded-pill bg-track"><span className={cx('block h-full rounded-pill grow-x', (x.s || 0) / 60 > TIME_GOAL_MIN ? 'fill-loss' : 'fill-real')} style={{ width: `${((x.s || 0) / maxS) * 100}%`, ['--i' as any]: i }} />{x.prev != null && <span aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 rounded-pill bg-ink" style={{ left: `calc(${(x.prev / maxS) * 100}% - 1px)` }} />}</span>
                <span className="text-right whitespace-nowrap min-w-[6.5rem]"><span className="text-body num font-medium">{fmtS(x.s)}</span>{x.prev != null && <span className="block"><DeltaChip value={((x.s || 0) - x.prev) / 60} unit="min" digits={1} good="down" /></span>}</span>
              </TipItem>
            ))}
          </ul>
        </ChartCard>
      </Grid>
      <ChartCard title="Respostas mais frequentes" icon="grafico" sentence={ansSentence}
        aside={<ChartLegend items={[{ kind: 'cat-1', label: 'Sem problema' }, { kind: 'loss', label: 'Não conforme' }]} />}
        action={qs.length > 6 ? { label: allQ ? 'Mostrar menos' : `Ver as ${qs.length} perguntas`, onClick: () => setAllQ(!allQ) } : undefined}
        state={qs.length ? 'ready' : 'empty'} empty={{ title: 'Sem respostas no período', detail: 'Fotos, textos e datas não entram neste painel.' }}>
        <ul className="flex flex-col">
          {shownQ.map((q) => {
            const vals = q.values || []; const prev = bq[q.question_id]?.flag_rate;
            const vl = (v: string) => (q.type === 'nota' ? `Nota ${v}` : v);
            const def = qDefs[q.template + '|' + q.question_id] || { type: q.type };
            let ok = 0;
            // respostas não conformes do período, a mais recente por veículo
            const tpl = R.templates.find((t: any) => t.name === q.template);
            const bad: any[] = Object.values(R.responses.filter((r: any) => tpl && r.templateId === tpl.id && r.assetId && r.finishedAt >= a[0] && r.finishedAt <= a[1] && isFlagged(def, r.answers?.[q.question_id]?.value))
              .reduce((m: any, r: any) => { if (!m[r.assetId] || m[r.assetId].finishedAt < r.finishedAt) m[r.assetId] = r; return m; }, {}));
            return (
              <li key={q.template + q.question_id} className="grid gap-x-4 gap-y-tight md:grid-cols-[minmax(0,16rem)_1fr_auto] items-center py-3 border-t border-line first:border-t-0">
                <span className="min-w-0"><span className="block text-body font-medium">{q.label}</span><span className="block text-caption text-ink-2">{q.template} · {q.answers} respostas{q.avg != null ? ` · nota média ${num(q.avg, 1)}` : ''}</span></span>
                <span className="min-w-0">
                  <span className="flex h-5 rounded-chip overflow-hidden bg-surface-muted">{vals.map((v) => <span key={v.value} className={cx('h-full', isFlagged(def, v.value) ? 'fill-loss' : FILL[CATS[Math.min(ok++, 3)]])} style={{ width: `${(v.qty / q.answers) * 100}%` }} title={`${vl(v.value)}: ${v.qty} (${pct(v.qty / q.answers, 0)})`} />)}</span>
                  <span className="block text-caption text-ink-2 mt-1 truncate">{vals.slice(0, 5).map((v) => `${vl(v.value)} ${pct(v.qty / q.answers, 0)}`).join(' · ')}</span>
                </span>
                <span className="md:text-right whitespace-nowrap min-w-[8rem]">
                  <span className={cx('text-body num font-medium', q.flag_rate ? 'text-loss-ink' : '')}>{pct(q.flag_rate || 0, 0)}</span><span className="text-caption text-ink-2"> não conforme</span>
                  {prev != null && <span className="block"><DeltaChip value={ppDelta(q.flag_rate, prev)} digits={0} good="down" /></span>}
                </span>
                {bad.length > 0 && (
                  <div className="md:col-span-3 flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-caption text-ink-2">Veículos não conformes:</span>
                    {bad.map((r) => {
                      const key = `${r.id}:${q.question_id}`; const os = osFrom(key); const v = r.answers[q.question_id].value;
                      const name = s.assets.find((x: any) => x.id === r.assetId)?.name || r.assetId;
                      return (
                        <span key={key} className="inline-flex items-center gap-2 h-8 pl-3 pr-tight rounded-pill border border-line text-caption">
                          <AssetName name={name} /><span className="text-ink-2">{q.type === 'nota' ? `nota ${v}` : v} · {fmtD(r.finishedAt)}</span>
                          {os ? <Link to="/manutencao" className="link-brand font-medium px-tight hover:underline">OS #{os.num}</Link> : <TextButton onClick={() => openOs(key, q, r, q.type === 'nota' ? `nota ${v}` : v)} className="px-tight">Abrir OS</TextButton>}
                        </span>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </ChartCard>
      <Card title="Quem não lançou" icon="usuario" actions={miss.length ? <Button variant="ghost" size="sm" onClick={() => remind([...new Set(miss.map((m) => m.person))])}>Enviar lembrete para todos</Button> : undefined}>
        <Table minWidth={680} head={['Pessoa', 'Checklist', 'Não lançados', 'Último previsto', '']} rows={miss.slice(0, 20).map((m) => [<span className="font-medium">{m.person}</span>, m.template, <span className="num">{m.n}</span>, <span className="num">{fmtD(m.last)}</span>,
          sent[m.person] ? <span className="text-caption text-ink-2 whitespace-nowrap">Lembrete enviado às <span className="num">{fmtDT(sent[m.person]).slice(-5)}</span></span> : <TextButton onClick={() => remind([m.person])}>Enviar lembrete</TextButton>])} emptyState={<EmptyState illustration="ilu-tudo-em-dia" title="Todos os checklists previstos foram preenchidos" />} align={['left', 'left', 'right', 'left', 'right']} />
        {Object.keys(sent).length > 0 && <p className="text-caption text-ink-2 mt-3">Na demonstração o lembrete fica registrado e não é enviado. Em produção, vai por notificação do app do motorista.</p>}
        {miss.length > 20 && <p className="text-caption text-ink-2 mt-3">Mostrando 20 de {miss.length} combinações de pessoa e checklist.</p>}
      </Card>
    </Stack>
  );
}

// ---------- Modelos ----------
function Modelos() {
  const R = useCk();
  const [t, setT] = useState<any>(null);
  const setQ = (i: number, k: string, v: any) => setT({ ...t, questions: t.questions.map((q: any, j: number) => (j === i ? { ...q, [k]: v } : q)) });
  const desc = (x: any) => SCHED[x.schedule.type] + (x.schedule.type === 'ciclo' ? ` (${x.schedule.cycleDays} dias)` : x.schedule.type === 'semanal' ? ` (${WD[x.schedule.weekday ?? 1]})` : x.schedule.type === 'mensal' ? ` (dia ${x.schedule.monthDay ?? 1})` : '');
  const who = (x: any) => [...x.targets.groupIds.map((g: string) => R.groups.find((y: any) => y.id === g)?.name), ...x.targets.personIds.map((p: string) => R.people.find((y: any) => y.id === p)?.name)].filter(Boolean).join(', ') || '—';
  return (
    <>
      <Card title="Modelos de checklist" actions={<Button onClick={() => setT({ name: '', active: true, schedule: { type: 'diario', startDate: Date.now() }, targets: { groupIds: [], personIds: [] }, questions: [{ id: uid('q'), label: '', type: 'sim_nao', required: true, flagValues: [] }] })}>Novo modelo</Button>}>
        <Table head={['Modelo', 'Perguntas', 'Periodicidade', 'Quem responde', 'Ativo', '']} rows={R.templates.map((x: any) => [<span className="font-medium">{x.name}</span>, x.questions.length, desc(x), <span className="text-small">{who(x)}</span>, <Check label="" checked={x.active} onChange={(v) => R.setActive(x.id, v).catch((e) => toast.error(e, 'Não foi possível alterar o modelo'))} />, <div className="flex gap-3"><TextButton onClick={() => setT(JSON.parse(JSON.stringify(x)))}>Editar</TextButton><TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir o modelo "${x.name}"?`, detail: 'Todas as respostas deste modelo também são apagadas. Não dá para desfazer.' })) { try { await R.deleteTemplate(x.id); toast('Modelo excluído.'); } catch (e) { toast.error(e, 'Não foi possível excluir o modelo'); } } }}>Excluir</TextButton></div>])} />
      </Card>
      <Modal open={!!t} onClose={() => setT(null)} title={t?.id ? 'Editar modelo' : 'Novo modelo de checklist'} width="max-w-4xl" footer={<><Button variant="ghost" onClick={() => setT(null)}>Cancelar</Button><Button disabled={!t?.name || !t?.questions.length || !t?.questions.every((q: any) => q.label && (q.type !== 'sim_nao' || (q.flagValues || []).length)) || !(t?.targets.groupIds.length || t?.targets.personIds.length)} onClick={async () => { try { await R.saveTemplate(t); setT(null); toast(t.id ? 'Modelo salvo.' : 'Modelo incluído.'); } catch (e) { toast.error(e, 'Não foi possível salvar o modelo'); } }}>Salvar modelo</Button></>}>
        {t && <>
          <Field label="Nome do checklist"><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field>
          <span className="text-body font-semibold">Perguntas</span>
          {t.questions.map((q: any, i: number) => (
            <Panel key={q.id} dense className="flex flex-col gap-2">
              <div className="grid md:grid-cols-[1fr_230px_auto] gap-2 items-center">
                <Input aria-label="Pergunta" value={q.label} onChange={(e) => setQ(i, 'label', e.target.value)} placeholder={`Pergunta ${i + 1}`} />
                <Select aria-label="Tipo" value={q.type} onChange={(e) => { const ty = e.target.value; setT({ ...t, questions: t.questions.map((x: any, j: number) => (j === i ? { ...x, type: ty, flagValues: [], scaleMax: ty === 'nota' ? 5 : x.scaleMax, flagBelow: ty === 'nota' ? 2 : undefined, options: ty === 'multipla' ? ['Bom', 'Regular', 'Ruim'] : x.options } : x)) }); }} options={Object.entries(QTYPES).map(([k, l]) => ({ value: k, label: l }))} />
                <IconButton aria-label="Remover pergunta" tone="outline" onClick={() => setT({ ...t, questions: t.questions.filter((_: any, j: number) => j !== i) })}><Icon name="fechar" size={18} /></IconButton>
              </div>
              {q.type === 'multipla' && <Field label="Opções (separe por vírgula)"><Input value={(q.options || []).join(', ')} onChange={(e) => setQ(i, 'options', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></Field>}
              {q.type === 'multipla' && <div className="flex flex-wrap gap-3 items-center text-body"><span className="text-small font-medium text-ink-2">Não conforme:</span>{(q.options || []).map((o: string) => <Check key={o} label={o} checked={(q.flagValues || []).includes(o)} onChange={(v) => setQ(i, 'flagValues', v ? [...(q.flagValues || []), o] : q.flagValues.filter((x: string) => x !== o))} />)}</div>}
              {q.type === 'sim_nao' && <div className="flex gap-3 items-center text-body"><span className="text-small font-medium text-ink-2">Não conforme quando a resposta é:</span><Select className="w-28" value={(q.flagValues || [])[0] || ''} onChange={(e) => setQ(i, 'flagValues', e.target.value ? [e.target.value] : [])} options={[{ value: '', label: 'Escolha…' }, { value: 'Sim', label: 'Sim' }, { value: 'Não', label: 'Não' }, { value: '-', label: 'Nenhuma (só informativa)' }]} /></div>}
              {q.type === 'nota' && <div className="flex flex-wrap gap-3 items-end"><Field label="Nota de 1 a"><Select className="w-24" value={String(q.scaleMax || 5)} onChange={(e) => setQ(i, 'scaleMax', +e.target.value)} options={['5', '10']} /></Field><Field label="Não conforme se a nota for até"><Input className="w-24" type="number" value={q.flagBelow ?? ''} onChange={(e) => setQ(i, 'flagBelow', e.target.value === '' ? undefined : +e.target.value)} /></Field></div>}
              {q.type === 'datahora' && <p className="text-caption text-ink-2">O motorista não digita nada: a data e a hora são carimbadas no envio.</p>}
              <div className="flex gap-5"><Check label="Obrigatória" checked={q.required} onChange={(v) => setQ(i, 'required', v)} />{['multipla', 'sim_nao', 'nota'].includes(q.type) && <Check label="Exigir foto junto" checked={q.requirePhoto} onChange={(v) => setQ(i, 'requirePhoto', v)} />}</div>
            </Panel>
          ))}
          <Button variant="soft" className="self-start" onClick={() => setT({ ...t, questions: [...t.questions, { id: uid('q'), label: '', type: 'sim_nao', required: true, flagValues: [] }] })}>Adicionar pergunta</Button>
          <span className="text-body font-semibold">Periodicidade</span>
          <div className="flex flex-wrap gap-3 items-end">
            <Field label="Frequência"><Select className="w-52" value={t.schedule.type} onChange={(e) => setT({ ...t, schedule: { ...t.schedule, type: e.target.value, startDate: t.schedule.startDate || Date.now(), dates: t.schedule.dates || [] } })} options={Object.entries(SCHED).map(([k, l]) => ({ value: k, label: l }))} /></Field>
            {t.schedule.type === 'diario' && <Check label="Incluir domingos" checked={t.schedule.sundays} onChange={(v) => setT({ ...t, schedule: { ...t.schedule, sundays: v } })} />}
            {t.schedule.type === 'semanal' && <Field label="Dia da semana"><Select className="w-40" value={String(t.schedule.weekday ?? 1)} onChange={(e) => setT({ ...t, schedule: { ...t.schedule, weekday: +e.target.value } })} options={WD.map((w, i) => ({ value: String(i), label: w }))} /></Field>}
            {t.schedule.type === 'mensal' && <Field label="Dia do mês"><Input className="w-24" type="number" min={1} max={28} value={t.schedule.monthDay ?? 1} onChange={(e) => setT({ ...t, schedule: { ...t.schedule, monthDay: +e.target.value } })} /></Field>}
            {t.schedule.type === 'ciclo' && <><Field label="A cada (dias)"><Input className="w-24" type="number" value={t.schedule.cycleDays || 45} onChange={(e) => setT({ ...t, schedule: { ...t.schedule, cycleDays: +e.target.value } })} /></Field><Field label="A partir de"><Input type="date" value={toInputD(t.schedule.startDate || Date.now())} onChange={(e) => setT({ ...t, schedule: { ...t.schedule, startDate: new Date(e.target.value + 'T00:00').getTime() } })} /></Field></>}
          </div>
          {t.schedule.type === 'datas' && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 items-end"><Field label="Adicionar data"><Input type="date" id="nd" /></Field><Button variant="soft" onClick={() => { const v = (document.getElementById('nd') as HTMLInputElement).value; if (v) setT({ ...t, schedule: { ...t.schedule, dates: [...new Set([...(t.schedule.dates || []), v])].sort() } }); }}>Adicionar</Button></div>
              <div className="flex flex-wrap gap-tight">{(t.schedule.dates || []).map((d: string) => <FilterChip key={d} label={<span className="num">{fmtD(d + 'T00:00')}</span>} onRemove={() => setT({ ...t, schedule: { ...t.schedule, dates: t.schedule.dates.filter((x: string) => x !== d) } })} />)}</div>
            </div>
          )}
          <span className="text-body font-semibold">Quem responde</span>
          <div className="flex flex-wrap gap-4">{R.groups.map((g: any) => <Check key={g.id} label={<span>{g.name} <span className="text-ink-2 num">({resolveGroup(g, R.people).length})</span></span>} checked={t.targets.groupIds.includes(g.id)} onChange={(v) => setT({ ...t, targets: { ...t.targets, groupIds: v ? [...t.targets.groupIds, g.id] : t.targets.groupIds.filter((x: string) => x !== g.id) } })} />)}</div>
          <details><summary className="text-small font-medium link-brand cursor-pointer">Adicionar pessoas avulsas</summary>
            <div className="flex flex-wrap gap-4 mt-2">{R.people.map((p: any) => <Check key={p.id} label={`${p.name} · ${ROLES[p.role] || p.role}`} checked={t.targets.personIds.includes(p.id)} onChange={(v) => setT({ ...t, targets: { ...t.targets, personIds: v ? [...t.targets.personIds, p.id] : t.targets.personIds.filter((x: string) => x !== p.id) } })} />)}</div>
          </details>
        </>}
      </Modal>
    </>
  );
}

// ---------- Grupos e pessoas ----------
function Grupos() {
  const R = useCk();
  const [g, setG] = useState<any>(null);
  const [p, setP] = useState({ name: '', role: 'chefe_patio' });
  const staff = R.people.filter((x: any) => x.role !== 'motorista');
  return (
    <Stack gap="grid">
      <Card title="Grupos de respondentes" actions={<Button onClick={() => setG({ name: '', ruleCnh: [], ruleRoles: [], memberIds: [] })}>Novo grupo</Button>}>
        <p className="text-small text-ink-2 mb-3">Um grupo junta pessoas por regra (categoria da CNH ou função) e por escolha avulsa. Quem entrar na regra depois já passa a responder.</p>
        <Table head={['Grupo', 'Regra', 'Pessoas', '']} rows={R.groups.map((x: any) => { const m = resolveGroup(x, R.people); return [<span className="font-medium">{x.name}</span>, [x.ruleCnh?.length && `CNH ${x.ruleCnh.join('/')}`, x.ruleRoles?.length && x.ruleRoles.map((r: string) => ROLES[r]).join(', '), x.memberIds?.length && `${x.memberIds.length} avulso(s)`].filter(Boolean).join(' · ') || '—', <span className="text-small">{m.map((y: any) => y.name).join(', ') || '—'}</span>, <div className="flex gap-3"><TextButton onClick={() => setG(JSON.parse(JSON.stringify(x)))}>Editar</TextButton><TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir o grupo "${x.name}"?`, detail: 'Os modelos que usam este grupo ficam sem quem responder.' })) { await R.deleteGroup(x.id); toast('Grupo excluído.'); } }}>Excluir</TextButton></div>]; })} />
      </Card>
      <Card title="Pessoas que não são motoristas">
        <p className="text-small text-ink-2 mb-3">Motoristas são cadastrados em Gestão de ativos › Motoristas. Aqui entram chefes de pátio, porteiros e mecânicos que também respondem checklists.</p>
        <div className="flex flex-wrap gap-2 items-end mb-4"><Field label="Nome"><Input className="w-64" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field><Field label="Função"><Select className="w-44" value={p.role} onChange={(e) => setP({ ...p, role: e.target.value })} options={Object.entries(ROLES).filter(([k]) => k !== 'motorista').map(([k, l]) => ({ value: k, label: l }))} /></Field><Button disabled={!p.name} onClick={async () => { await R.saveStaff(p); toast(`${p.name} incluído.`); setP({ ...p, name: '' }); }}>Adicionar</Button></div>
        <Table head={['Nome', 'Função', '']} rows={staff.map((x: any) => [<span className="font-medium">{x.name}</span>, ROLES[x.role] || x.role, <TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Remover ${x.name}?`, detail: 'A pessoa sai dos grupos e deixa de receber checklists.', confirmLabel: 'Remover' })) { await R.deleteStaff(x.id); toast(`${x.name} removido.`); } }}>Remover</TextButton>])} />
      </Card>
      <Modal open={!!g} onClose={() => setG(null)} title={g?.id ? 'Editar grupo' : 'Novo grupo'} width="max-w-3xl" footer={<><Button variant="ghost" onClick={() => setG(null)}>Cancelar</Button><Button disabled={!g?.name} onClick={async () => { await R.saveGroup(g); setG(null); toast(g.id ? 'Grupo salvo.' : 'Grupo incluído.'); }}>Salvar grupo</Button></>}>
        {g && <>
          <Field label="Nome do grupo"><Input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Ex.: Motoristas classe E" /></Field>
          <span className="text-body font-semibold">Entram automaticamente os motoristas com CNH</span>
          <div className="flex gap-4">{['A', 'B', 'C', 'D', 'E'].map((c) => <Check key={c} label={c} checked={g.ruleCnh.includes(c)} onChange={(v) => setG({ ...g, ruleCnh: v ? [...g.ruleCnh, c] : g.ruleCnh.filter((x: string) => x !== c) })} />)}</div>
          <span className="text-body font-semibold">E as pessoas com a função</span>
          <div className="flex flex-wrap gap-4">{Object.entries(ROLES).map(([k, l]) => <Check key={k} label={l} checked={g.ruleRoles.includes(k)} onChange={(v) => setG({ ...g, ruleRoles: v ? [...g.ruleRoles, k] : g.ruleRoles.filter((x: string) => x !== k) })} />)}</div>
          <span className="text-body font-semibold">Pessoas avulsas</span>
          <div className="flex flex-wrap gap-4">{R.people.map((x: any) => <Check key={x.id} label={x.name} checked={g.memberIds.includes(x.id)} onChange={(v) => setG({ ...g, memberIds: v ? [...g.memberIds, x.id] : g.memberIds.filter((y: string) => y !== x.id) })} />)}</div>
          <p className="text-body bg-card-2 rounded-ctl p-3">Neste grupo: <span className="font-medium">{resolveGroup(g, R.people).map((x: any) => x.name).join(', ') || 'ninguém ainda'}</span></p>
        </>}
      </Modal>
    </Stack>
  );
}

// ---------- Preencher ----------
function Preencher({ onDone }: any) {
  const R = useCk();
  const s = useStoreData();
  const [pid, setPid] = useState('');
  const person = R.people.find((p: any) => p.id === pid) || R.people[0];
  const myTemplates = useMemo(() => R.templates.filter((t: any) => t.active && (t.targets.personIds.includes(person?.id) || t.targets.groupIds.some((g: string) => { const gr = R.groups.find((x: any) => x.id === g); return gr && resolveGroup(gr, R.people).some((x: any) => x.id === person?.id); }))), [person?.id, R.templates, R.groups]);
  const today = startOfDay(Date.now());
  const pending = myTemplates.map((t: any) => { const occ = occurrences(t, today - 40 * DAY, Date.now()).filter(([, b]) => b > Date.now()); const win = occ[occ.length - 1]; const done = win && R.responses.some((r: any) => r.templateId === t.id && r.personId === person?.id && r.finishedAt >= win[0] && r.finishedAt < win[1]); return { t, due: !!win && !done, done }; });
  const [tid, setTid] = useState<string | null>(null);
  const tpl = R.templates.find((x: any) => x.id === tid);
  const localRef = person?.localRef || person?.id;
  const defaultAsset = s.assets.find((a: any) => a.driverId === localRef)?.id || '';
  const [asset, setAsset] = useState('');
  const [ans, setAns] = useState<any>({});
  const [started, setStarted] = useState(Date.now());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const open = (id: string) => { setTid(id); setAns({}); setStarted(Date.now()); setErr(''); setAsset(defaultAsset); };
  const set = (q: string, k: string, v: any) => setAns((a: any) => ({ ...a, [q]: { ...a[q], [k]: v } }));
  const assetId = asset || defaultAsset;
  const submit = async () => {
    const a = { ...ans };
    tpl.questions.filter((q: any) => q.type === 'km' && !a[q.id]?.value && assetId).forEach((q: any) => (a[q.id] = { value: String(Math.round(assetKm(s, assetId))) }));
    tpl.questions.filter((q: any) => q.type === 'data' && !a[q.id]?.value).forEach((q: any) => (a[q.id] = { value: toInputD(Date.now()) }));
    setBusy(true); const e = await R.submit({ templateId: tpl.id, personId: person.id, assetId, startedAt: started, answers: a }); setBusy(false);
    if (e) return setErr(e);
    setTid(null); onDone();
  };
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <Card title="Simulação do app">
        <Field label="Quem está usando o app"><Select value={person?.id || ''} onChange={(e) => { setPid(e.target.value); setTid(null); }} options={R.people.map((p: any) => ({ value: p.id, label: `${p.name} · ${ROLES[p.role] || p.role}` }))} /></Field>
        {!tpl && <div className="flex flex-col gap-2 mt-4">
          <span className="text-body font-semibold">Checklists de {person?.name}</span>
          {pending.map(({ t, due, done }: any) => <button key={t.id} type="button" onClick={() => open(t.id)} className={cx('text-left p-4 rounded-ctl flex items-center gap-3 bg-card hover:bg-card-2', due ? 'border border-line-strong' : 'border border-line')}><div className="mr-auto"><div className="font-semibold">{t.name}</div><div className="text-caption text-ink-2">{SCHED[t.schedule.type]} · {t.questions.length} perguntas</div></div>{due ? <Badge tone="orange">Pendente</Badge> : done ? <Badge tone="green">Feito</Badge> : <Badge>Fora do dia</Badge>}</button>)}
          {!pending.length && <EmptyState illustration="ilu-checklist" size="page" title="Nenhum checklist atribuído a esta pessoa" detail="Quando um modelo for atribuído a um grupo dela, ele aparece aqui." />}
        </div>}
      </Card>
      {tpl && (
        <Card title={tpl.name} actions={<Button variant="ghost" size="sm" onClick={() => setTid(null)}>Voltar</Button>}>
          <Field label="Veículo" className="mb-4"><SearchSelect value={assetId} onChange={setAsset} placeholder="Sem veículo" options={opAssets(s).map((a: any) => ({ value: a.id, label: a.name }))} /></Field>
          <Stack gap="grid">
            {tpl.questions.map((q: any) => (
              <Panel key={q.id} className="flex flex-col gap-2">
                <span className="text-body font-semibold">{q.label}{q.required && <span className="text-crit-ink"> *</span>}</span>
                {q.type === 'sim_nao' && <div className="grid grid-cols-2 gap-2">{['Sim', 'Não'].map((o) => <button key={o} type="button" onClick={() => set(q.id, 'value', o)} className={cx('h-14 rounded-ctl font-semibold text-h3 transition-colors', ans[q.id]?.value === o ? 'bg-brand-fill text-brand-fill-ink' : 'bg-card border border-line-strong text-ink hover:bg-card-2')}>{o}</button>)}</div>}
                {q.type === 'nota' && <div className="flex flex-wrap gap-2">{Array.from({ length: q.scaleMax || 5 }, (_, i) => String(i + 1)).map((o) => <button key={o} type="button" onClick={() => set(q.id, 'value', o)} className={cx('w-12 h-12 rounded-ctl font-semibold num transition-colors', ans[q.id]?.value === o ? 'bg-brand-fill text-brand-fill-ink' : 'bg-card border border-line-strong text-ink hover:bg-card-2')}>{o}</button>)}</div>}
                {q.type === 'multipla' && <div className="flex flex-wrap gap-2">{(q.options || []).map((o: string) => <button key={o} type="button" onClick={() => set(q.id, 'value', o)} className={cx('h-12 px-5 rounded-ctl font-medium transition-colors', ans[q.id]?.value === o ? 'bg-brand-fill text-brand-fill-ink' : 'bg-card border border-line-strong text-ink hover:bg-card-2')}>{o}</button>)}</div>}
                {q.type === 'km' && <Input type="number" inputMode="numeric" value={ans[q.id]?.value ?? (assetId ? String(Math.round(assetKm(s, assetId))) : '')} onChange={(e) => set(q.id, 'value', e.target.value)} />}
                {q.type === 'km' && <span className="text-caption text-ink-2">Preenchido com o km atual do veículo; corrija só se o painel mostrar outro valor.</span>}
                {q.type === 'data' && <Input type="date" value={ans[q.id]?.value ?? toInputD(Date.now())} onChange={(e) => set(q.id, 'value', e.target.value)} />}
                {q.type === 'datahora' && <div className="h-11 rounded-ctl bg-card-2 border border-line flex items-center gap-2 px-3 text-small font-medium text-ink-2"><Icon name="relogio" size={16} />Carimbo automático no envio · agora <span className="num">{fmtDT(Date.now())}</span></div>}
                {q.type === 'texto' && <Textarea rows={2} value={ans[q.id]?.value || ''} onChange={(e) => set(q.id, 'value', e.target.value)} />}
                {(q.type === 'foto' || q.requirePhoto) && <Dropzone label="Foto" required={q.requirePhoto} className="h-28" value={ans[q.id]?.photo} onChange={(d) => set(q.id, 'photo', d)} previewAlt={`Foto: ${q.label}`} />}
                {isFlagged(q, ans[q.id]?.value) && <span className="text-caption font-medium text-crit-ink">Esta resposta será sinalizada como problema.</span>}
              </Panel>
            ))}
            {err && <p className="text-body font-medium text-crit-ink">{err}</p>}
            <Button className="h-12 text-base" disabled={busy} onClick={submit}>{busy ? 'Enviando…' : 'Enviar checklist'}</Button>
          </Stack>
        </Card>
      )}
    </div>
  );
}

// ---------- Respostas ----------
function Respostas() {
  const R = useCk();
  const s = useStoreData();
  const [v, setV] = useState<any>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [onlyFlag, setOnlyFlag] = useState(false);
  const tpl = (id: string) => R.templates.find((t: any) => t.id === id);
  const flags = (r: any) => (tpl(r.templateId)?.questions || []).filter((q: any) => r.answers?.[q.id]?.flagged ?? isFlagged(q, r.answers?.[q.id]?.value)).length;
  const list = [...R.responses].filter((r: any) => !onlyFlag || flags(r)).sort((a: any, b: any) => b.finishedAt - a.finishedAt).slice(0, 150);
  const openR = async (r: any) => { setV(r); setPhotos({}); const t = tpl(r.templateId); for (const q of (t?.questions || []).filter((q: any) => q.type === 'foto' || q.requirePhoto)) { const ph = await R.photoOf(r.id, q.id); if (ph) setPhotos((p) => ({ ...p, [q.id]: ph })); } };
  return (
    <>
      <Card title="Respostas recebidas" actions={<Check label="Só com problema" checked={onlyFlag} onChange={setOnlyFlag} />}>
        <Table head={['Enviado em', 'Checklist', 'Pessoa', 'Veículo', 'Tempo', 'Com problema', '']} rows={list.map((r: any) => { const n = flags(r); return [fmtDT(r.finishedAt), <span className="font-medium">{tpl(r.templateId)?.name}</span>, R.people.find((p: any) => p.id === r.personId)?.name || '—', s.assets.find((a: any) => a.id === r.assetId)?.name || '—', num((r.finishedAt - r.startedAt) / MIN, 1) + ' min', n ? <Badge tone="red">{n}</Badge> : <Badge tone="green">0</Badge>, <TextButton onClick={() => openR(r)}>Ver</TextButton>]; })} />
      </Card>
      <Modal open={!!v} onClose={() => setV(null)} title={tpl(v?.templateId)?.name || ''}>
        {v && <DescList>{tpl(v.templateId)?.questions.map((q: any) => { const a = v.answers[q.id]; const fl = a?.flagged ?? isFlagged(q, a?.value); return <DescRow key={q.id} stacked label={q.label}><span className={cx('font-medium', fl && 'text-crit-ink')}>{a?.value || (q.type === 'foto' ? '' : '—')}{fl && ' · problema'}</span>{photos[q.id] && <img src={photos[q.id]} alt={`Foto: ${q.label}`} className="mt-2 h-32 rounded-ctl" />}</DescRow>; })}</DescList>}
      </Modal>
    </>
  );
}
