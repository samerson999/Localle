import { useMemo, useState } from 'react';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Tabs, PageHeader, Pills, TextButton, Callout, EmptyState, Progress, TabPanel, DateInput, cx, toast, confirmAction, Panel, Stack, Grid } from '../components/ui';
import { PeriodCompare, presetValue, periodRanges, BI_PRESETS, type PeriodValue } from '../components/PeriodCompare';
import { ColumnChart, CompareBars } from '../components/charts';
import { computeDays, HARDEN, clampLegal, jornadaLimits } from '../lib/jornada';
import { JornadaDocs, LegalNote } from '../components/JornadaDocs';
import { KpiTile, ChartCard, StatusDot, AssetName } from '../components/story';
import { Icon } from '../components/icons';
import { FolhaPonto } from '../components/FolhaPonto';
import { usePrint } from '../components/PrintPortal';
import { JOURNEY_TYPES } from '../lib/catalog';
import { fmtD, fmtDT, fmtT, hm, num, pct, toInputDT, toInputD, DAY, sum } from '../lib/utils';

export default function Jornada() {
  const [tab, setTab] = useState('painel');
  const s = useStoreData(); const cfg = useCfg();
  const company = { name: cfg.companyName || s.revenda.clientName, cnpj: cfg.companyCnpj, address: cfg.companyAddress };
  const [period, setPeriod] = useState<PeriodValue>(() => presetValue(BI_PRESETS[0], 'anterior'));
  return (
    <div>
      <PageHeader icon="jornada" title="Gestão de jornada" subtitle="Controle de ponto do motorista conforme a Lei 13.103/2015" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head"><Tabs value={tab} onChange={setTab} tabs={[{ key: 'painel', label: 'Visão geral' }, { key: 'marcacoes', label: 'Marcações' }, { key: 'folha', label: 'Folha de ponto' }, { key: 'termo', label: 'Termo de orientação' }, { key: 'documentos', label: 'Termos e medidas' }, { key: 'regras', label: 'Regras' }]} />{tab === 'painel' && <div className="ml-auto"><PeriodCompare value={period} onChange={setPeriod} /></div>}</div>
      <TabPanel id={tab}>
      {tab === 'painel' && <Painel goDocs={() => setTab('documentos')} period={period} />}
      {tab === 'marcacoes' && <Marcacoes />}
      {tab === 'folha' && <Folha />}
      {tab === 'termo' && <Termo />}
      {tab === 'documentos' && <JornadaDocs company={company} />}
      {tab === 'regras' && <Regras />}
      </TabPanel>
    </div>
  );
}

// critério de "muitos apontamentos": parâmetro do Setup "jornada.apontamentos_atencao" (camada cliente)
const REPEAT = { min: 3, days: 30 };
const useCfg = () => useStore((s) => s.journeyCfg || { maxExtra: 2 });
const useDays = (driverId: string) => { const marks = useStore((s) => s.journey.filter((m: any) => m.driverId === driverId)); const d = useStore((s) => s.drivers.find((x: any) => x.id === driverId)); const cfg = useCfg(); return useMemo(() => computeDays(marks, d?.regime, cfg), [marks.length, JSON.stringify(cfg), d?.regime]); };

// Descumprimentos são atenção (laranja), não crítico: não entram no "Precisa de você".
const CODES = [{ key: 'pausa', label: 'Pausa não respeitada', short: 'Pausa' }, { key: 'interjornada', label: 'Interjornada abaixo do mínimo', short: 'Interjornada' }, { key: 'jornada', label: 'Jornada excedida', short: 'Jornada' }, { key: 'refeicao', label: 'Refeição abaixo do mínimo', short: 'Refeição' }, { key: 'semanal', label: 'Descanso semanal abaixo do mínimo', short: 'Semanal' }];


function Painel({ goDocs, period }: { goDocs: () => void; period: PeriodValue }) {
  const s = useStoreData();
  const cfg = useCfg();
  const { a, b } = periodRanges(period);
  const data = useMemo(() => s.drivers.map((d: any) => ({ d, days: computeDays(s.journey.filter((m: any) => m.driverId === d.id), d.regime, cfg) })), [s.journey.length, JSON.stringify(cfg), s.drivers]);
  const violIn = (r: [number, number]) => data.flatMap(({ d, days }) => days.filter((x) => x.day >= r[0] && x.day <= r[1]).flatMap((x) => x.violations.map((v) => ({ d, x, v })))).sort((p, q) => q.x.day - p.x.day);
  const extraIn = (r: [number, number]) => sum(data.flatMap(({ days }) => days.filter((x) => x.day >= r[0] && x.day <= r[1]).map((x) => x.extra)));
  const A = violIn(a), B = b ? violIn(b) : null;
  const hasB = !!B && data.some(({ days }) => days.some((x) => b && x.day >= b[0] && x.day <= b[1]));
  const n = (list: any[], c: string) => list.filter((x) => x.v.code === c).length;
  const today = new Date().setHours(0, 0, 0, 0);
  const now = data.map(({ d, days }) => ({ d, t: days.find((x) => x.day === today) })).filter((x) => x.t);
  const L = jornadaLimits(cfg);
  // por dia (até um mês) ou por semana
  const step = a[1] - a[0] <= 35 * DAY ? DAY : 7 * DAY;
  const buckets: { label: string; from: number; to: number }[] = [];
  for (let t = a[0]; t <= a[1]; t += step) buckets.push({ label: fmtD(t).slice(0, 5), from: t, to: Math.min(a[1], t + step - 1) });
  const inB = (list: any[], r: { from: number; to: number }) => list.filter((x) => x.x.day >= r.from && x.x.day <= r.to);
  // total por dia ou semana; a divisão por tipo está nos cartões acima
  const chart = buckets.map((r) => ({ label: r.label, value: inB(A, r).length }));
  const prev = hasB && b ? buckets.map((r) => { const off = a[0] - b[0]; return inB(B!, { from: r.from - off, to: r.to - off }).length; }) : undefined;
  const per = data.map(({ d, days }) => { const mine = A.filter((x) => x.d.id === d.id); const cnt: Record<string, number> = {}; mine.forEach((x) => (cnt[x.v.code] = (cnt[x.v.code] || 0) + 1)); const top = Object.entries(cnt).sort((p, q) => q[1] - p[1])[0]; return { d, n: mine.length, top: top ? CODES.find((c) => c.key === top[0])?.label : '', extra: sum(days.filter((x) => x.day >= a[0] && x.day <= a[1]).map((x) => x.extra)), measures: (s.discipline || []).filter((l: any) => l.driverIds.includes(d.id) && l.kind !== 'coletivo').length }; }).sort((p, q) => q.n - p.n);
  const worst = per[0];
  const repeat = per.filter((r) => r.n >= REPEAT.min);
  const kpi = (c: string, sub: string) => { const k = CODES.find((x) => x.key === c)!; const v = n(A, c); return <KpiTile key={c} label={k.label} value={v} status={v ? 'parado' : undefined} delta={{ value: hasB ? v - n(B!, c) : null, unit: '', digits: 0, good: 'down' }} sub={sub} />; };
  return (
    <Stack gap="grid">
      <Grid cols={5} equal>
        <KpiTile label="Descumprimentos" value={A.length} status={A.length ? 'parado' : undefined} delta={{ value: hasB ? A.length - B!.length : null, unit: '', digits: 0, good: 'down' }} sub={`${new Set(A.map((x) => x.d.id)).size} motoristas`} />
        {kpi('pausa', `Direção contínua acima de ${hm(L.contCargas)} (cargas)`)}
        {kpi('interjornada', `Mínimo ${L.inter / 3600000}h entre jornadas`)}
        {kpi('jornada', `Até ${L.base / 3600000}h + ${L.maxExtraH}h extras`)}
        <KpiTile label="Horas extras" value={extraIn(a) / 3600000} unit="h" digits={0} delta={{ value: hasB && b && extraIn(b) ? ((extraIn(a) - extraIn(b)) / extraIn(b)) * 100 : null, unit: '%', good: 'down' }} sub="Soma de todos os motoristas" />
      </Grid>
      <ChartCard title={step === DAY ? 'Descumprimentos por dia' : 'Descumprimentos por semana'} icon="jornada" period="Todos os tipos" state={A.length ? 'ready' : 'empty'} empty={{ title: 'Nenhum descumprimento no período', detail: 'As marcações do período respeitaram os limites da Lei 13.103.' }}
        sentence={A.length ? `${CODES.map((c) => ({ c, v: n(A, c.key) })).sort((p, q) => q.v - p.v)[0].c.label} é o descumprimento mais comum (${pct(CODES.map((c) => n(A, c.key)).sort((p, q) => q - p)[0] / A.length, 0)} do total).` : undefined}>
        {prev ? <CompareBars groups={chart.map((c, i) => ({ label: c.label, cur: c.value, prev: prev[i] }))} format={(v) => num(v)} curLabel="Período atual" prevLabel="Período anterior" good="down" height={220} />
          : <ColumnChart data={chart} format={(v) => num(v)} good="down" height={220} label="Descumprimentos" />}
      </ChartCard>
      <Card title="Por motorista" icon="usuario" actions={repeat.length ? <TextButton onClick={goDocs}>Emitir termo ou medida</TextButton> : undefined}>
        <p className="text-small text-ink-2 mb-3">{worst?.n ? `${worst.d.name} concentra ${pct(worst.n / Math.max(1, A.length), 0)} dos descumprimentos do período.` : 'Nenhum descumprimento no período.'} Com {REPEAT.min} ou mais, emita o termo de marcação incorreta ou registre a medida disciplinar.</p>
        <Table minWidth={820} align={['left', 'right', 'left', 'right', 'right', 'left']} head={['Motorista', 'Descumprimentos', 'Mais frequente', 'Horas extras', 'Medidas anteriores', 'Parcela']} rows={per.map((r) => [
          <span className="inline-flex flex-col"><span className="font-medium">{r.d.name}</span>{r.n >= REPEAT.min && <StatusDot kind="parado" label="Muitos apontamentos" className="text-caption text-ink-2" />}</span>, <span className="num">{r.n}</span>, r.top || <span className="text-ink-3">—</span>, <span className="num">{hm(r.extra)}</span>, <span className="num">{r.measures}</span>,
          <div className="flex items-center gap-2 min-w-[140px]"><Progress className="h-2 flex-1" value={A.length ? r.n / A.length : 0} color="var(--warn)" label={`${pct(A.length ? r.n / A.length : 0, 0)} dos descumprimentos`} /><span className="num w-10 text-right">{pct(A.length ? r.n / A.length : 0, 0)}</span></div>])} />
      </Card>
      <Card title="Jornada de hoje" icon="relogio">
        {now.length === 0 ? <EmptyState illustration="ilu-jornada" layout="row" title="Ninguém iniciou jornada hoje" detail="Com o simulador rodando, as marcações chegam pelo teclado embarcado ou pelo app." /> : (
          <Table minWidth={900} align={['left', 'right', 'left', 'right', 'right', 'right', 'right', 'right', 'left']} head={['Motorista', 'Início', 'Situação', 'Trabalhado', 'Direção', 'Maior direção contínua', 'Refeição', 'Espera', 'Descumprimentos']} rows={now.map(({ d, t }: any) => [<span className="font-medium">{d.name}</span>, <span className="num">{fmtT(t.start)}</span>, t.open ? <StatusDot kind="mov" label="Em jornada" /> : <StatusDot kind="off" label={`Encerrada ${fmtT(t.end)}`} />, <span className="num">{hm(t.worked)}</span>, <span className="num">{hm(t.driving)}</span>, <span className={cx('num', t.maxCont > (d.regime === 'passageiros' ? L.contPassageiros : L.contCargas) && 'text-warn-ink font-medium')}>{hm(t.maxCont)}</span>, <span className="num">{hm(t.meal)}</span>, <span className="num">{hm(t.wait)}</span>, t.violations.length ? <StatusDot kind="parado" label={String(t.violations.length)} /> : <span className="text-ink-3">0</span>])} />
        )}
      </Card>
      <Card title="Descumprimentos do período" icon="alerta">
        <Table minWidth={760} emptyState={<EmptyState illustration="ilu-tudo-em-dia" title="Nenhum descumprimento no período" />} head={['Data', 'Motorista', 'Descumprimento', 'Detalhe']} rows={A.slice(0, 80).map(({ d, x, v }) => [<span className="num">{fmtD(x.day)}</span>, <span className="font-medium">{d.name}</span>, <StatusDot kind="parado" label={v.label} />, <span className="text-small text-ink-2">{v.detail}</span>])} />
        {A.length > 80 && <p className="text-caption text-ink-2 mt-2 num">Mostrando os 80 mais recentes de {A.length}.</p>}
      </Card>
    </Stack>
  );
}

function Marcacoes() {
  const s = useStoreData();
  const [d, setD] = useState(s.drivers[0].id);
  const [type, setType] = useState('inicio_jornada');
  const [ts, setTs] = useState(toInputDT(Date.now()));
  const [src, setSrc] = useState('app');
  const marks = s.journey.filter((m: any) => m.driverId === d).sort((a: any, b: any) => b.ts - a.ts).slice(0, 80);
  return (
    <Stack gap="grid">
      <Card title="Registrar marcação" icon="mais">
        <p className="text-small text-ink-2 mb-3">As marcações chegam do teclado de jornada instalado no veículo ou do app do motorista. Use este formulário para simular uma marcação ou fazer um ajuste.</p>
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Motorista"><SearchSelect className="w-52" value={d} onChange={setD} options={s.drivers.map((x: any) => ({ value: x.id, label: x.name }))} /></Field>
          <Field label="Marcação"><Select className="w-52" value={type} onChange={(e) => setType(e.target.value)} options={Object.entries(JOURNEY_TYPES).map(([k, l]) => ({ value: k, label: l }))} /></Field>
          <Field label="Data e hora"><DateInput type="datetime-local" value={ts} max={toInputDT(Date.now())} onChange={(e) => setTs(e.target.value)} /></Field>
          <Field label="Origem"><Select className="w-40" value={src} onChange={(e) => setSrc(e.target.value)} options={[{ value: 'app', label: 'App do motorista' }, { value: 'teclado', label: 'Teclado embarcado' }, { value: 'manual', label: 'Ajuste manual' }]} /></Field>
          <Button onClick={() => { const t0 = new Date(ts).getTime(); if (!isFinite(t0) || t0 > Date.now()) return toast('Informe uma data e hora que não esteja no futuro.', { tone: 'crit' }); s.upsert('journey', { driverId: d, type, ts: t0, source: src }); toast('Marcação registrada.', { detail: `${s.drivers.find((x: any) => x.id === d)?.name} · ${JOURNEY_TYPES[type]}` }); }}>Registrar</Button>
        </div>
      </Card>
      <Card title="Últimas marcações" icon="historico">
        <Table minWidth={640} emptyState={<EmptyState illustration="ilu-jornada" layout="row" title="Nenhuma marcação deste motorista" detail="As marcações chegam do teclado embarcado ou do app; você também pode registrar acima." />} head={['Data e hora', 'Marcação', 'Origem', 'Veículo', '']} rows={marks.map((m: any) => [<span className="num">{fmtDT(m.ts)}</span>, <span className="font-medium">{JOURNEY_TYPES[m.type]}</span>, { app: 'App', teclado: 'Teclado', manual: 'Ajuste manual' }[m.source as string], <AssetName name={s.assets.find((a: any) => a.id === m.assetId)?.name} />, <TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: 'Excluir esta marcação?', detail: `${JOURNEY_TYPES[m.type]} de ${fmtDT(m.ts)}. A marcação faz parte do espelho de ponto; exclua só se foi lançada por engano.` })) { s.remove('journey', m.id); toast('Marcação excluída.', { action: { label: 'Desfazer', onClick: () => s.upsert('journey', m) } }); } }}>Excluir</TextButton>])} />
      </Card>
    </Stack>
  );
}

function Folha() {
  const s = useStoreData();
  const cfg = useCfg();
  const { print, portal } = usePrint();
  const [d, setD] = useState(s.drivers[0].id);
  const nowD = new Date();
  const [mode, setMode] = useState('mes');
  const [ym, setYm] = useState(`${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`);
  const [from, setFrom] = useState(toInputD(Date.now() - 14 * DAY));
  const [to, setTo] = useState(toInputD(Date.now()));
  const [y, m] = ym.split('-').map(Number);
  const range: [number, number] = mode === 'mes' ? [new Date(y, m - 1, 1).getTime(), new Date(y, m, 0).getTime()] : [new Date(from + 'T00:00').getTime(), new Date(to + 'T00:00').getTime()];
  const company = { name: cfg.companyName || s.revenda.clientName, cnpj: cfg.companyCnpj, address: cfg.companyAddress };
  const sheet = (drv: any) => <FolhaPonto key={drv.id} driver={drv} marks={s.journey.filter((x: any) => x.driverId === drv.id)} from={range[0]} to={range[1]} company={company} maxExtra={cfg.maxExtra} cfg={cfg} issuedBy={s.session?.name} assetName={s.assets.find((a: any) => a.driverId === drv.id)?.name} />;
  const selected = d === 'todos' ? s.drivers : s.drivers.filter((x: any) => x.id === d);
  return (
    <Stack gap="grid">
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Motorista"><SearchSelect className="w-56" value={d} onChange={setD} options={[...s.drivers.map((x: any) => ({ value: x.id, label: x.name })), { value: 'todos', label: 'Todos os motoristas (um por página)' }]} /></Field>
          <Field label="Período"><Pills value={mode} onChange={setMode} options={[{ key: 'mes', label: 'Competência' }, { key: 'custom', label: 'Personalizado' }]} /></Field>
          {mode === 'mes' ? <Field label="Competência"><DateInput type="month" value={ym} onChange={(e) => setYm(e.target.value)} /></Field> : <><Field label="De"><DateInput type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Até"><DateInput type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field></>}
          <Button variant="dark" onClick={() => print(<>{selected.map(sheet)}</>)}><Icon name="imprimir" size={18} />Imprimir / salvar PDF{selected.length > 1 ? ` (${selected.length} folhas)` : ''}</Button>
        </div>
        <p className="text-caption text-ink-2 mt-3">A impressão sai em A4 paisagem, só com o documento. Os dados da empresa (CNPJ e endereço) ficam em Jornada › Regras; CPF e matrícula, no cadastro do motorista.</p>
        <div className="mt-3"><LegalNote /></div>
      </Card>
      <Card className="overflow-x-auto">
        <div style={{ minWidth: 1000 }}>{sheet(selected[0])}</div>
        {selected.length > 1 && <p className="text-small text-ink-2 mt-4">Prévia do primeiro motorista. A impressão inclui {selected.length} folhas.</p>}
      </Card>
      {portal}
    </Stack>
  );
}

function Termo() {
  const s = useStoreData();
  const { print, portal } = usePrint();
  const [d, setD] = useState(s.drivers[0].id);
  const drv = s.drivers.find((x: any) => x.id === d);
  const company = s.revenda.clientName;
  const cfg = useCfg();
  return (
    <Stack gap="grid">
      <Card className="no-print"><div className="flex flex-wrap gap-3 items-end"><Field label="Motorista"><Select className="w-52" value={d} onChange={(e) => setD(e.target.value)} options={s.drivers.map((x: any) => ({ value: x.id, label: x.name }))} /></Field><Button variant="dark" onClick={() => print(<div className="doc-sheet" style={{ fontSize: 14, maxWidth: 760, margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: document.getElementById('termo-doc')?.innerHTML || '' }} />)}><Icon name="imprimir" size={18} />Imprimir para assinatura</Button></div><div className="mt-3"><LegalNote /></div></Card>
      <article id="termo-doc" className="bg-card border border-line rounded-card p-8 md:p-12 max-w-3xl print-area text-body leading-relaxed">
        <h2 className="text-h2 font-semibold text-center mb-6">Termo de ciência sobre controle de jornada e tempo de direção</h2>
        <p className="mb-3">Eu, <b>{drv?.name}</b>, portador(a) da CNH nº <b>{drv?.cnh}</b>, categoria <b>{drv?.cnhCat}</b>, motorista profissional empregado(a) de <b>{company}</b>, declaro que fui orientado(a) e estou ciente das regras de jornada de trabalho e tempo de direção previstas na Lei nº 13.103/2015, na CLT (arts. 235-A a 235-H) e no Código de Trânsito Brasileiro (art. 67-C), em especial:</p>
        <ol className="list-decimal pl-6 mb-3 space-y-tight">
          <li>A jornada diária é de 8 horas, admitida a prorrogação por até {cfg.maxExtra} horas extraordinárias{cfg.maxExtra === 4 ? ', conforme convenção ou acordo coletivo' : ''}.</li>
          <li>É assegurado intervalo mínimo de 1 hora para refeição.</li>
          <li>É assegurado descanso de 11 horas a cada 24 horas, podendo ser fracionado nos termos da lei, e descanso semanal de 35 horas.</li>
          <li>É vedado dirigir por mais de 5 horas e meia ininterruptas, devendo ser observados 30 minutos de descanso a cada 6 horas na condução de veículo de carga (4 horas para passageiros), facultado o fracionamento.</li>
          <li>O tempo de espera não é computado como jornada nem como hora extra, sendo indenizado na proporção de 30% do salário-hora normal.</li>
          <li>Devo registrar todas as marcações (início e fim de jornada, direção, refeição, espera e descanso) no teclado embarcado ou no aplicativo fornecido pela empresa, sendo esses registros a base do meu controle de ponto.</li>
          <li>Os registros podem ser auditados pela empresa a partir dos dados do rastreador e do sistema de telemetria do veículo.</li>
        </ol>
        <p className="mb-3">Comprometo-me a cumprir as pausas e descansos obrigatórios e a comunicar imediatamente qualquer impedimento ao seu cumprimento. Declaro ter recebido cópia deste termo.</p>
        <p className="mb-12">Local e data: ______________________, ____/____/________</p>
        <div className="grid md:grid-cols-2 gap-10 text-center text-small"><div className="border-t border-ink pt-2">{drv?.name}<br />Motorista</div><div className="border-t border-ink pt-2">{company}<br />Empregador</div></div>
      </article>
      {portal}
    </Stack>
  );
}

function Regras() {
  const s = useStoreData();
  const cfg = useCfg();
  const [err, setErr] = useState<Record<string, string>>({});
  return (
    <Card title="Parâmetros de jornada" icon="config">
      <div className="flex flex-col gap-4 max-w-2xl">
        <div className="grid md:grid-cols-3 gap-field">
          <Field label="Razão social do empregador"><Input value={cfg.companyName ?? s.revenda.clientName} onChange={(e) => s.patch(() => ({ journeyCfg: { ...cfg, companyName: e.target.value } }))} /></Field>
          <Field label="CNPJ"><Input value={cfg.companyCnpj || ''} onChange={(e) => s.patch(() => ({ journeyCfg: { ...cfg, companyCnpj: e.target.value } }))} placeholder="00.000.000/0001-00" /></Field>
          <Field label="Endereço"><Input value={cfg.companyAddress || ''} onChange={(e) => s.patch(() => ({ journeyCfg: { ...cfg, companyAddress: e.target.value } }))} /></Field>
        </div>
        <div>
          <p className="text-body font-medium mb-1">Limites da operação</p>
          <p className="text-small text-ink-2 mb-3">A Lei 13.103/2015 é o piso: a empresa pode ser mais rigorosa, nunca mais branda. Um valor que afrouxe a lei volta ao limite legal. Os novos limites valem para o painel, a folha de ponto e o ranking.</p>
          <div className="grid md:grid-cols-2 gap-x-4 gap-y-3">
            {Object.entries(HARDEN).map(([k, h]) => {
              const cur = k === 'maxExtra' ? Math.min(clampLegal(k, cfg[k] ?? 2), 4) : clampLegal(k, cfg[k]);
              return (
                <Field key={k} label={h.label} hint={err[k] ? undefined : `${h.dir === 'down' ? 'Máximo' : 'Mínimo'} legal ${String(h.legal).replace('.', ',')}h · ${h.ref}`}>
                  <Input type="number" step="0.5" defaultValue={cur} key={k + cur} aria-invalid={!!err[k]} className={err[k] ? '!border-crit' : ''} onChange={() => err[k] && setErr({ ...err, [k]: '' })} onBlur={(e) => {
                    const n = +e.target.value;
                    // a lei é piso: valor que afrouxa é recusado no campo e o valor salvo continua valendo
                    if (e.target.value === '' || isNaN(n) || n <= 0 || clampLegal(k, n) !== n) { setErr({ ...err, [k]: `${h.dir === 'down' ? 'Máximo' : 'Mínimo'} legal: ${String(h.legal).replace('.', ',')} h · ${h.ref}. Mantido ${String(cur).replace('.', ',')} h.` }); e.target.value = String(cur); return; }
                    s.patch(() => ({ journeyCfg: { ...cfg, [k]: n } }));
                  }} />
                  {err[k] && <p role="alert" className="text-caption text-crit-ink mt-1">{err[k]}</p>}
                </Field>
              );
            })}
          </div>
          {(cfg.maxExtra ?? 2) > 2 && <Callout className="mt-3">Mais de 2 horas extras por dia só valem com convenção ou acordo coletivo.</Callout>}
        </div>
        <Panel tone="muted" className="text-small text-ink-2 leading-relaxed">
          Regras verificadas automaticamente: jornada diária + extras; refeição mínima quando a jornada passa de 6h; interjornada mínima; descanso semanal; direção contínua máxima (cargas ou passageiros, definido no cadastro do motorista); horas noturnas entre 22h e 5h; tempo de espera separado da jornada.
        </Panel>
      </div>
    </Card>
  );
}
