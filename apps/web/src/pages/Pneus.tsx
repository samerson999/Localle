import { RetiredToggle } from '../components/RetiredToggle';
import { opAssets, isOut } from '../lib/assetLifecycle';
import { useState } from 'react';
import { useStore, useStoreData } from '../lib/store';
import { TireProvider, useTires } from '../lib/tireRepo';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Tabs, Pills, Modal, PageHeader, cx, TextButton, Callout, Panel, EmptyState, ErrorState, Progress, TabPanel, toast, confirmAction, DescList, DescRow, SearchInput, Grid, Stack } from '../components/ui';
import { Dropzone } from '../components/Dropzone';
import { PeriodCompare, presetValue, periodRanges, BI_PRESETS, type PeriodValue } from '../components/PeriodCompare';
import { KpiTile, ChartCard, StatusDot, StatusGlyph, Num, IdChip, AssetName, numSizeClass } from '../components/story';
import { ColumnChart, CompareBars, LineChart, TipItem } from '../components/charts';
import { Icon } from '../components/icons';
import { TIRE_STATUS, LEVEL, LAYOUTS, LEGAL_MIN_MM, ROLE_LABEL, MOVE_LABEL, layoutKey, layoutOf, positionsFor, posLabel, roleOf, lifeLabel, movesOf, wearBy } from '@localle/shared/pneus';
import { currentCoupling, compositionName } from '@localle/shared/couplings';
import { brl, fmtD, num, pct, monthKey, monthLabel, sum, groupBy, toInputD, abbr } from '@localle/shared/utils';

// Gestão de pneus. Terceiro maior custo da frota; o módulo também é vendido separadamente (revenda.modules.pneus).
export default function Pneus() { return <TireProvider><PneusInner /></TireProvider>; }

const STATUS_DOT: Record<string, 'mov' | 'parado' | 'off' | 'crit'> = { montado: 'mov', estoque: 'off', recapagem: 'parado', sucata: 'off' };
const brlShort = (v: number) => `R$ ${abbr(v)}`;


function PneusInner() {
  const [tab, setTab] = useState('visao');
  const [open, setOpen] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodValue>(() => presetValue(BI_PRESETS[3], 'anterior'));
  return (
    <div>
      <PageHeader icon="pneus" title="Gestão de pneus" subtitle="Posições, sulcos, vidas, movimentações, desgaste e custo por km" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head">
        <RetiredToggle />
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'visao', label: 'Visão geral' }, { key: 'veiculos', label: 'Por veículo' }, { key: 'medicoes', label: 'Medir sulcos' }, { key: 'desgaste', label: 'Desgaste e custo' }, { key: 'lista', label: 'Todos os pneus' }, { key: 'estoque', label: 'Estoque' }, { key: 'config', label: 'Parâmetros' }]} />
        {tab === 'visao' && <div className="ml-auto"><PeriodCompare value={period} onChange={setPeriod} /></div>}
      </div>
      <TabPanel id={tab}>
        {tab === 'visao' && <Visao onOpen={setOpen} period={period} />}
        {tab === 'veiculos' && <Veiculos onOpen={setOpen} />}
        {tab === 'medicoes' && <Medicoes />}
        {tab === 'desgaste' && <Desgaste onOpen={setOpen} />}
        {tab === 'lista' && <Lista onOpen={setOpen} />}
        {tab === 'estoque' && <Estoque onOpen={setOpen} />}
        {tab === 'config' && <Config />}
      </TabPanel>
      {open && <TireDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

const useAll = () => { const R = useTires(); return R.tires.map((t: any) => ({ t, st: R.stats(t) })); };
const aName = (s: any, id: string) => s.assets.find((a: any) => a.id === id)?.name || '—';
// moeda: fonte da interface com algarismos tabulares (nunca mono)
const Money = ({ v, size = 'body' }: { v: number | null | undefined; size?: 'body' | 'small' | 'lg' | 'kpi' }) => <Num value={v} prefix="R$" digits={2} size={size} count={size === 'kpi'} />;

// Identificação gravada no pneu: logo da empresa (quando cadastrado) + número (código, em chip mono)
function TireTag({ t, size = 'sm' }: { t: any; size?: 'sm' | 'md' }) {
  const logo = useTires().cfg.markLogo;
  return <span className="inline-flex items-center gap-tight whitespace-nowrap">{logo && <img src={logo} alt="" className="h-4 w-auto max-w-[2.5rem] object-contain" />}<IdChip size={size}>{t.fireNumber}</IdChip></span>;
}
const Level = ({ st }: { st: any }) => <StatusDot kind={LEVEL[st.level].kind} label={<><span className="num">{num(st.tread, 1)} mm</span>{st.level !== 'ok' && <span className="text-ink-2"> · {LEVEL[st.level].label}</span>}</>} />;

// ---------------------------------------------------------------- visão geral (BI)
function Visao({ onOpen, period }: any) {
  const s = useStoreData();
  const R = useTires();
  const all = useAll();
  const { a, b } = periodRanges(period);
  const calc = (r: [number, number] | null) => {
    if (!r) return null;
    const [from, to] = r;
    const lives = R.tires.flatMap((t: any) => t.lives.map((l: any) => ({ ...l, t }))).filter((l: any) => l.date >= from && l.date <= to);
    const compras = sum(lives.filter((l: any) => l.kind === 'novo').map((l: any) => l.cost));
    const recap = sum(lives.filter((l: any) => l.kind === 'recapagem').map((l: any) => l.cost));
    // km rodados pelos pneus no período (proporcional ao tempo de cada montagem dentro do período)
    const km = sum(R.tires.flatMap((t: any) => t.mounts).map((m: any) => { const f = Math.max(m.from, from), e = Math.min(m.to ?? Date.now(), to); if (e <= f) return 0; const span = (m.to ?? Date.now()) - m.from; const kmTot = Math.max(0, (m.kmTo ?? R.kmOf(m.assetId)) - m.kmFrom); return span > 0 ? kmTot * ((e - f) / span) : 0; }));
    const scrapped = R.tires.filter((t: any) => t.status === 'sucata' && t.scrapDate >= from && t.scrapDate <= to).length;
    return { compras, recap, total: compras + recap, km, cpk: km ? ((compras + recap) / km) * 1000 : null, nNew: lives.filter((l: any) => l.kind === 'novo').length, nRecap: lives.filter((l: any) => l.kind === 'recapagem').length, scrapped, lives };
  };
  const A = calc(a)!, B = calc(b);
  const rel = (x: number | null, y: number | null | undefined) => (x == null || y == null || !y ? null : ((x - y) / y) * 100);
  // meses do período A, com o mesmo índice do período B para a barra anterior
  const months = (r: [number, number]) => { const out: string[] = []; const d = new Date(r[0]); d.setDate(1); while (d.getTime() <= r[1]) { out.push(monthKey(d.getTime())); d.setMonth(d.getMonth() + 1); } return out; };
  const mA = months(a), mB = b ? months(b) : [];
  const byMonth = (lives: any[], k: string) => lives.filter((l) => monthKey(l.date) === k);
  const data = mA.map((k) => { const ls = byMonth(A.lives, k); return { label: monthLabel(k), value: sum(ls.map((l) => l.cost)) }; });
  const prev = B ? mA.map((_, i) => (mB[i] ? sum(byMonth(B.lives, mB[i]).map((l: any) => l.cost)) : null)) : undefined;
  // rodando agora: pneus de veículo vendido/baixado só com "Incluir inativos"
  const rolling = all.filter((x: any) => x.t.status === 'montado' && !/^EST/.test(x.t.position) && (s.includeRetired || !isOut(s.assets.find((a: any) => a.id === x.t.assetId))));
  const lv = (k: string) => rolling.filter((x: any) => x.st.level === k);
  const toRemove = rolling.filter((x: any) => ['retirar', 'ilegal'].includes(x.st.level)).sort((p: any, q: any) => p.st.tread - q.st.tread);
  const stock = all.filter((x: any) => x.t.status === 'estoque');
  const spendSentence = B && B.total ? `Gasto ${A.total >= B.total ? 'subiu' : 'caiu'} ${num(Math.abs(rel(A.total, B.total)!), 0)}% em relação ao período anterior; ${A.nNew} pneus novos e ${A.nRecap} recapagens no período.` : `${A.nNew} pneus novos e ${A.nRecap} recapagens no período.`;
  const ilegal = lv('ilegal').length;
  return (
    <Stack gap="grid">
      <Grid cols={4} equal>
        <KpiTile label="Gasto com pneus" display={<Money v={A.total} size="kpi" />} delta={{ value: rel(A.total, B?.total), unit: '%', good: 'down' }} sub={`${brl(A.compras)} em novos · ${brl(A.recap)} em recapagem`} />
        <KpiTile label="Custo por 1.000 km" display={<Money v={A.cpk} size="kpi" />} delta={{ value: rel(A.cpk, B?.cpk), unit: '%', good: 'down' }} sub={<><Num value={A.km} unit="km" size="small" /> rodados pelos pneus</>} />
        <KpiTile label="Recapagens" value={A.nRecap} delta={{ value: B ? A.nRecap - B.nRecap : null, unit: '', digits: 0, good: 'up' }} sub="Cada recapagem custa uma fração do pneu novo" />
        <KpiTile label="Descartados" value={A.scrapped} delta={{ value: B ? A.scrapped - B.scrapped : null, unit: '', digits: 0, good: 'down' }} sub={`${stock.length} pneus em estoque · ${brl(sum(stock.map((x: any) => x.st.life.cost)))}`} />
      </Grid>
      <Grid split="7/5" wide equal>
        <ChartCard title="Gasto mensal com pneus" icon="grafico" period="Pneus novos e recapagem" sentence={spendSentence} state={A.lives.length || (prev || []).some(Boolean) ? 'ready' : 'empty'}>
          <div className="flex-1 min-h-0 flex flex-col justify-center">
            {prev
              ? <CompareBars groups={data.map((d, i) => ({ label: d.label, cur: d.value, prev: prev[i] ?? 0 }))} format={brlShort} curLabel="Período atual" prevLabel="Período anterior" height={210} />
              : <ColumnChart data={data} format={brlShort} height={210} label="Gasto mensal com pneus" />}
          </div>
        </ChartCard>
        <ChartCard title="Sulco dos pneus rodando" icon="pneus" period="agora" sentence={ilegal ? `${ilegal} ${ilegal === 1 ? 'pneu está' : 'pneus estão'} abaixo do mínimo legal de ${num(LEGAL_MIN_MM, 1)} mm e ${ilegal === 1 ? 'aparece' : 'aparecem'} em "Precisa de você".` : toRemove.length ? `${toRemove.length} pneus chegaram ao sulco de retirada (${num(R.cfg.removal, 1)} mm).` : 'Nenhum pneu rodando no limite de retirada.'}>
          <ul className="flex flex-col gap-stack">
            {(['ok', 'atencao', 'retirar', 'ilegal'] as const).map((k) => (
              <TipItem title={LEVEL[k].label} rows={[{ label: 'Pneus', value: `${lv(k).length} de ${rolling.length}`, strong: true }, { label: 'Parcela', value: rolling.length ? pct(lv(k).length / rolling.length, 0) : '—' }]} key={k} className="grid grid-cols-[minmax(0,11rem)_1fr_3rem] items-center gap-3 text-body">
                <StatusDot kind={LEVEL[k].kind} label={k === 'ok' ? `Acima de ${num(R.cfg.warn, 1)} mm` : k === 'atencao' ? `Atenção (até ${num(R.cfg.warn, 1)} mm)` : k === 'retirar' ? `Retirar (até ${num(R.cfg.removal, 1)} mm)` : `Abaixo de ${num(LEGAL_MIN_MM, 1)} mm (legal)`} />
                <Progress value={rolling.length ? lv(k).length / rolling.length : 0} color={k === 'ok' ? 'var(--ink-2)' : k === 'atencao' ? 'var(--warn)' : 'var(--loss)'} label={`${lv(k).length} de ${rolling.length} pneus`} />
                <span className="num text-right">{lv(k).length}</span>
              </TipItem>
            ))}
          </ul>
          <p className="text-caption text-ink-2 mt-4 num">{rolling.length} pneus montados, sem contar estepes.</p>
        </ChartCard>
      </Grid>
      <Card title={`Pneus para retirar (${toRemove.length})`} icon="pneus">
        <Table minWidth={860} emptyState={<EmptyState icon="ok" title="Nenhum pneu montado no limite de retirada" />} head={['Pneu', 'Veículo', 'Posição', 'Sulco', 'Vida', 'Destino sugerido', '']} rows={toRemove.map(({ t, st }: any) => [<TireTag t={t} />, <AssetName name={aName(s, t.assetId)} />, posLabel(t.position), <Level st={st} />, lifeLabel(st.lifeNo), st.livesLeft > 0 && t.recappable ? 'Enviar para recapagem' : 'Descartar (vidas esgotadas)', <TextButton onClick={() => onOpen(t.id)}>Abrir</TextButton>])} />
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- por veículo: diagrama de eixos
function Veiculos({ onOpen }: any) {
  const s = useStoreData();
  const R = useTires();
  const vehs = opAssets(s).filter((a: any) => a.kind === 'veiculo' || a.kind === 'implemento');
  const [aid, setAid] = useState(vehs[0]?.id);
  const [slot, setSlot] = useState<string | null>(null);
  const asset = vehs.find((a: any) => a.id === aid);
  const at = (pos: string) => R.tires.find((t: any) => t.status === 'montado' && t.assetId === aid && t.position === pos);
  return (
    <Stack gap="grid">
      <Card>
        <div className="flex flex-wrap gap-x-5 gap-y-3 items-end">
          <Field label="Veículo"><Select className="w-64" value={aid} onChange={(e) => { setAid(e.target.value); setSlot(null); }} options={vehs.map((a: any) => ({ value: a.id, label: `${a.name} · ${a.model}` }))} /></Field>
          <Field label="Tipo de eixo"><Pills value={layoutKey(asset)} onChange={async (k) => { if (await R.setLayout(aid, k)) { setSlot(null); toast(`Tipo de eixo: ${LAYOUTS[k].label}.`); } }} options={Object.entries(LAYOUTS).map(([k, v]) => ({ key: k, label: v.label }))} /></Field>
          <span className="text-small text-ink-2 pb-2 ml-auto">{asset?.kind === 'implemento' && <>{currentCoupling(s, aid) ? <>{compositionName(s, currentCoupling(s, aid)!.items)} com <AssetName name={aName(s, currentCoupling(s, aid)!.tractorId)} /> · </> : 'Desengatada · '}</>}Km atual <Num value={R.kmOf(aid)} unit="km" size="small" className="font-semibold text-ink" />{asset?.kind === 'implemento' && ' (pelos engates)'}</span>
        </div>
      </Card>
      <Grid split="8/4">
        <Card title={<span className="inline-flex items-center gap-2">Posições <AssetName name={asset?.name} size="md" /></span>} icon="pneus">
          <AxleDiagram asset={asset} at={at} selected={slot} onSelect={setSlot} />
          <div className="flex flex-wrap gap-x-5 gap-y-tight mt-5 pt-4 border-t border-line">
            {(['ok', 'atencao', 'retirar', 'ilegal'] as const).map((k) => <StatusDot key={k} kind={LEVEL[k].kind} label={LEVEL[k].label} className="text-ink-2" />)}
            <span className="text-small text-ink-2 ml-auto">Vista de cima, frente para cima. Clique numa posição.</span>
          </div>
        </Card>
        {slot ? <SlotPanel key={aid + slot} aid={aid} pos={slot} onOpen={onOpen} onClose={() => setSlot(null)} /> : <Card><EmptyState icon="pneus" title="Escolha uma posição" detail="Para montar, medir, fazer rodízio ou retirar o pneu." /></Card>}
      </Grid>
    </Stack>
  );
}

function AxleDiagram({ asset, at, selected, onSelect }: { asset: any; at: (pos: string) => any; selected: string | null; onSelect: (p: string) => void }) {
  const R = useTires();
  const L = layoutOf(asset);
  const trailer = layoutKey(asset) === 'carreta';
  const Tire = ({ pos }: { pos: string }) => {
    const t = at(pos); const st = t && R.stats(t);
    // rounded-[10px]: forma ilustrativa do pneu, fora da escala de card/botão/nav/input — não normalizar
    return (
      <button type="button" onClick={() => onSelect(pos)} aria-pressed={selected === pos} aria-label={`${posLabel(pos)}: ${t ? `${t.fireNumber}, ${num(st.tread, 1)} mm` : 'vazio'}`}
        className={cx('w-[60px] h-[96px] rounded-[10px] flex flex-col items-center justify-center gap-1 px-1 text-center transition-colors', t ? 'bg-card border border-line-strong hover:border-ink-3' : 'border border-dashed border-line-strong text-ink-3 hover:border-ink-3', selected === pos && '!border-ink ring-2 ring-[var(--brand-ring)]')}>
        <span className="text-caption text-ink-2">{pos}</span>
        {t ? <>
          <span className="text-caption font-mono font-semibold leading-tight">{t.fireNumber.replace(/^[A-Z]+-/, '')}</span>
          <span className="inline-flex items-center gap-1 text-caption num"><StatusGlyph kind={LEVEL[st.level].kind} />{num(st.tread, 1)}</span>
        </> : <Icon name="mais" size={16} />}
      </button>
    );
  };
  return (
    <div className="flex flex-col items-center gap-6 py-2 overflow-x-auto">
      <div className="relative flex flex-col items-center gap-8">
        {/* chassi */}
        <span aria-hidden="true" className="absolute top-6 bottom-6 left-1/2 -translate-x-1/2 w-10 rounded-chip bg-surface-muted" />
        {!trailer ? <span className="relative text-caption text-ink-2 px-6 py-tight rounded-t-[18px] rounded-b-chip bg-surface-muted border border-line">Frente</span> : <span className="relative text-caption text-ink-2 px-4 py-1 rounded-chip bg-surface-muted border border-line">Pino-rei</span>}
        {L.axles.map((ax) => (
          <div key={ax.label} className="relative flex flex-col items-center gap-tight">
            <div className="relative flex items-center">
              <span aria-hidden="true" className="absolute left-4 right-4 top-1/2 h-1 -translate-y-1/2 rounded-pill bg-line-strong" />
              <div className="relative flex gap-1">{ax.left.map((p) => <Tire key={p} pos={p} />)}</div>
              <span className="w-24 sm:w-32" />
              <div className="relative flex gap-1">{ax.right.map((p) => <Tire key={p} pos={p} />)}</div>
            </div>
            <span className="relative text-caption text-ink-2 bg-card px-tight">{ax.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-tight">
        <div className="flex gap-2">{L.spares.map((p) => <Tire key={p} pos={p} />)}</div>
        <span className="text-caption text-ink-2">{L.spares.length > 1 ? 'Estepes' : 'Estepe'}</span>
      </div>
    </div>
  );
}

function SlotPanel({ aid, pos, onOpen, onClose }: any) {
  const s = useStoreData();
  const R = useTires();
  const asset = s.assets.find((a: any) => a.id === aid);
  const t = R.tires.find((x: any) => x.status === 'montado' && x.assetId === aid && x.position === pos);
  const st = t && R.stats(t);
  const [kmV, setKmV] = useState(String(Math.round(R.kmOf(aid))));
  const [mm, setMm] = useState('');
  const [dest, setDest] = useState('estoque');
  const [reason, setReason] = useState('');
  const [swap, setSwap] = useState('');
  // estoque: primeiro os da mesma medida usada no veículo
  const sizeHere = R.tires.find((x: any) => x.status === 'montado' && x.assetId === aid)?.size;
  const stock = R.tires.filter((x: any) => x.status === 'estoque').sort((p: any, q: any) => (q.size === sizeHere ? 1 : 0) - (p.size === sizeHere ? 1 : 0));
  const [pick, setPick] = useState(stock[0]?.id || '');
  const others = positionsFor(asset).flatMap((g) => g.slots).filter((p) => p !== pos);
  const km = +kmV;
  return (
    <Card title={posLabel(pos)} actions={<TextButton onClick={onClose}>Fechar</TextButton>}>
      <p className="text-caption text-ink-2 -mt-2 mb-4 flex items-center gap-tight">{ROLE_LABEL[roleOf(asset, pos)]} · <AssetName name={asset?.name} /></p>
      <Field label={asset?.kind === 'implemento' ? 'Km da carreta agora' : 'Km do veículo agora'} hint={asset?.kind === 'implemento' ? 'Calculado pelos engates' : 'Lido do rastreador; corrija se o painel mostrar outro valor'}><Input type="number" value={kmV} onChange={(e) => setKmV(e.target.value)} /></Field>
      {!t ? (
        stock.length ? <div className="flex flex-col gap-3 mt-3">
          <Field label="Pneu do estoque"><Select value={pick} onChange={(e) => setPick(e.target.value)} options={stock.map((x: any) => ({ value: x.id, label: `${x.fireNumber} · ${x.brand} ${x.size} · ${lifeLabel(x.lives.length)}` }))} /></Field>
          {sizeHere && stock.find((x: any) => x.id === pick)?.size !== sizeHere && <Callout>Medida diferente da usada neste veículo ({sizeHere}).</Callout>}
          <Button disabled={!pick || !km} onClick={async () => { const p = stock.find((x: any) => x.id === pick); await R.mount(pick, aid, pos, km); toast(`${p?.fireNumber} montado em ${posLabel(pos).toLowerCase()}.`); }}>Montar nesta posição</Button>
        </div> : <p className="text-small text-ink-2 mt-3">Não há pneus em estoque. Cadastre um pneu em "Todos os pneus".</p>
      ) : (
        <div className="flex flex-col gap-4 mt-3">
          <div className="flex items-baseline gap-2"><TireTag t={t} size="md" /><span className="text-small text-ink-2 truncate">{t.brand} {t.model} · {t.size}</span></div>
          <DescList>
            <DescRow label="Sulco"><Level st={st} /></DescRow>
            <DescRow label="Vida">{lifeLabel(st.lifeNo)} · {t.maxLives - st.lifeNo > 0 ? `mais ${t.maxLives - st.lifeNo} recapagem(ns) possível(is)` : 'última vida'}</DescRow>
            <DescRow label="Km nesta vida"><Num value={st.kmLife} unit="km" size="body" />{st.kmLeft != null && <span className="text-ink-2"> · ≈ {num(st.kmLeft)} km até retirar</span>}</DescRow>
            <DescRow label="Desgaste da vida"><div className="flex items-center gap-2 w-40"><Progress className="h-2 flex-1" value={st.wear} color={st.level === 'ok' ? 'var(--ink-2)' : st.level === 'atencao' ? 'var(--warn)' : 'var(--loss)'} label={`Desgaste ${pct(st.wear, 0)}`} /><span className="num text-small">{pct(st.wear, 0)}</span></div></DescRow>
          </DescList>
          <TextButton className="self-start" onClick={() => onOpen(t.id)}>Ver vidas e movimentações</TextButton>
          <Panel dense className="flex items-end gap-2"><Field label="Sulco medido (mm)" className="flex-1"><Input type="number" step="0.1" inputMode="decimal" value={mm} onChange={(e) => setMm(e.target.value)} placeholder={num(st.tread, 1)} /></Field><Button disabled={!mm} onClick={async () => { await R.measure([{ tireId: t.id, mm: +mm }], km); setMm(''); toast(`Medição de ${num(+mm, 1)} mm registrada.`); }}>Registrar</Button></Panel>
          <Panel dense className="flex items-end gap-2"><Field label="Rodízio com" className="flex-1"><Select value={swap} onChange={(e) => setSwap(e.target.value)} options={[{ value: '', label: 'Escolha a posição' }, ...others.map((p) => { const o = R.tires.find((x: any) => x.status === 'montado' && x.assetId === aid && x.position === p); return { value: p, label: `${posLabel(p)}${o ? ` · ${o.fireNumber}` : ' · vazia'}` }; })]} /></Field><Button variant="dark" disabled={!swap} onClick={async () => { await R.rotate(aid, pos, swap, km); toast(`Rodízio: ${posLabel(pos)} ↔ ${posLabel(swap)}.`); onClose(); }}>Fazer rodízio</Button></Panel>
          <Panel dense className="flex flex-col gap-2">
            <Field label="Retirar e enviar para"><Pills value={dest} onChange={setDest} options={[{ key: 'estoque', label: 'Estoque' }, { key: 'recapagem', label: 'Recapadora' }, { key: 'sucata', label: 'Descarte' }]} /></Field>
            {dest === 'sucata' && <Field label="Motivo do descarte"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: corte lateral" /></Field>}
            {dest === 'recapagem' && (st.livesLeft <= 0 || !t.recappable) && <Callout tone="crit">Este pneu não tem mais vidas de recapagem.</Callout>}
            <Button variant="ghost" className="self-start" disabled={(dest === 'sucata' && !reason) || (dest === 'recapagem' && (st.livesLeft <= 0 || !t.recappable))} onClick={async () => { await R.unmount(t.id, km, dest, reason); toast(`${t.fireNumber} retirado: ${dest === 'estoque' ? 'voltou ao estoque' : dest === 'recapagem' ? 'enviado à recapadora' : 'descartado'}.`); onClose(); }}>Retirar pneu</Button>
          </Panel>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- medição de sulcos
function Medicoes() {
  const s = useStoreData();
  const R = useTires();
  const vehs = opAssets(s).filter((a: any) => a.kind === 'veiculo' || a.kind === 'implemento');
  const [aid, setAid] = useState(vehs[0]?.id);
  const asset = vehs.find((a: any) => a.id === aid);
  const order = positionsFor(asset).flatMap((g) => g.slots);
  const tires = R.tires.filter((t: any) => t.status === 'montado' && t.assetId === aid).sort((a: any, b: any) => order.indexOf(a.position) - order.indexOf(b.position));
  const [vals, setVals] = useState<Record<string, string>>({});
  const km = Math.round(R.kmOf(aid));
  const n = Object.values(vals).filter(Boolean).length;
  const save = async () => {
    await R.measure(Object.entries(vals).filter(([, v]) => v).map(([tireId, v]) => ({ tireId, mm: +v })), km, 'manual');
    toast(`${n} ${n === 1 ? 'medição salva' : 'medições salvas'} com km ${num(km)}.`); setVals({});
  };
  return (
    <Stack gap="grid">
      <Card title="Medir sulcos" icon="pneus">
        <div className="flex flex-wrap gap-x-5 gap-y-3 items-end mb-4">
          <Field label="Veículo"><SearchSelect className="w-56" value={aid} onChange={(v) => { setAid(v); setVals({}); }} options={vehs.map((a: any) => ({ value: a.id, label: a.name }))} /></Field>
          <span className="text-small text-ink-2 pb-2">Km gravado com a medição: <Num value={km} size="small" className="font-semibold text-ink" /> (rastreador)</span>
        </div>
        <Table minWidth={760} emptyState={<EmptyState icon="pneus" title="Nenhum pneu montado neste veículo" detail="Monte os pneus em Por veículo." />} head={['Posição', 'Pneu', 'Última medição', 'Novo sulco (mm)']} rows={tires.map((t: any) => { const st = R.stats(t); return [posLabel(t.position), <TireTag t={t} />, <span className="inline-flex flex-wrap items-center gap-x-2"><Level st={st} /><span className="text-caption text-ink-2 num">{st.lastMeasure ? `${fmtD(st.lastMeasure.ts)}${st.lastMeasure.source === 'profundimetro' ? ' · profundímetro' : ''}` : 'nunca medido'}</span></span>, <Input className="w-28" type="number" step="0.1" inputMode="decimal" aria-label={`Sulco ${posLabel(t.position)}`} placeholder={num(st.tread, 1)} value={vals[t.id] || ''} onChange={(e) => setVals({ ...vals, [t.id]: e.target.value })} />]; })} />
        <div className="flex flex-wrap gap-3 items-center mt-4"><Button onClick={save} disabled={!n}>Salvar {n ? `${n} ${n === 1 ? 'medição' : 'medições'}` : 'medições'}</Button></div>
      </Card>
      <Card title="Profundímetro Bluetooth" icon="sinal">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" disabled title="Disponível no app do motorista">Conectar profundímetro</Button>
          <p className="text-small text-ink-2 max-w-[80ch]">Preparado para o app: o operador escolhe a posição no diagrama e a medida do profundímetro entra direto, com origem "profundímetro". Por enquanto a medida é digitada aqui.</p>
        </div>
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- desgaste e custo por km
function Desgaste({ onOpen }: any) {
  const s = useStoreData();
  const all = useAll();
  const [more, setMore] = useState(25);
  const asset = (id: string) => s.assets.find((a: any) => a.id === id);
  const mounted = all.filter((x: any) => x.t.status === 'montado' && !/^EST/.test(x.t.position));
  const byRole = wearBy(mounted.map((x: any) => ({ ...x, key: roleOf(asset(x.t.assetId), x.t.position) })));
  const byBrand = wearBy(all.filter((x: any) => x.t.status === 'montado').map((x: any) => ({ ...x, key: x.t.brand })));
  // custo realizado por marca na vida inteira do pneu (compra + recapagens ÷ km rodados)
  const realBrand = Object.fromEntries(Object.entries(groupBy(all.filter((x: any) => x.st.kmAll > 1000), (x: any) => x.t.brand)).map(([k, arr]: any) => [k, (sum(arr.map((x: any) => x.st.cost)) / sum(arr.map((x: any) => x.st.kmAll))) * 1000]));
  const perTire = all.filter((x: any) => x.st.rate > 0 || x.st.kmAll > 1000).sort((p: any, q: any) => (q.st.lifeCpk || q.st.cpk) - (p.st.lifeCpk || p.st.cpk));
  const WearTable = ({ rows, label, keyLabel, real }: { rows: any[]; label: string; keyLabel: (k: string) => string; real?: Record<string, number> }) => {
    const max = Math.max(...rows.map((r) => r.cpk), 0.0001);
    return <Table minWidth={760} empty="Ainda não há medições suficientes." align={['left', 'right', 'right', 'right', 'left', ...(real ? ['right' as const] : [])]} head={[label, 'Pneus', 'Desgaste', 'Km previstos por vida', 'R$ por 1.000 km (vida atual)', ...(real ? ['R$ por 1.000 km (realizado)'] : [])]} rows={rows.map((r) => [<span className="font-medium">{keyLabel(r.key)}</span>, <span className="num">{r.n}</span>, <span className="num">{num(r.rate, 2)} mm/1.000 km</span>, <Num value={r.km} unit="km" size="body" />,
      <div className="flex items-center gap-2 min-w-[180px]"><Progress className="h-2 flex-1" value={r.cpk * 1000 / (max * 1000)} color="var(--real)" label={`${brl(r.cpk * 1000)} por 1.000 km`} /><span className="w-24 text-right"><Money v={r.cpk * 1000} /></span></div>, ...(real ? [real[r.key] != null ? <Money v={real[r.key]} /> : '—'] : [])])} />;
  };
  const best = byBrand[0], worst = byBrand[byBrand.length - 1];
  const role0 = [...byRole].sort((p, q) => q.rate - p.rate)[0];
  return (
    <Stack gap="grid">
      <ChartCard title="Por posição no veículo" icon="pneus" sentence={role0 ? `Pneus em ${ROLE_LABEL[role0.key as 'tracao'].toLowerCase()} gastam mais rápido (${num(role0.rate, 2)} mm a cada 1.000 km). O rodízio entre posições equilibra o desgaste.` : undefined}>
        <p className="text-small text-ink-2 mb-3 max-w-[90ch]">Vida atual dos pneus montados, com taxa de desgaste medida. Km previstos: do sulco inicial até o sulco de retirada. Custo por km: valor da vida (compra ou recapagem) dividido pelos km previstos.</p>
        <WearTable rows={byRole} label="Posição" keyLabel={(k) => ROLE_LABEL[k as 'tracao'] || k} />
      </ChartCard>
      <ChartCard title="Por marca" icon="grafico" sentence={best && worst && best !== worst ? `${best.key} tem o menor custo por km na vida atual (${brl(best.cpk * 1000)} por 1.000 km); ${worst.key}, o maior (${brl(worst.cpk * 1000)}).` : undefined}>
        <WearTable rows={byBrand} label="Marca" keyLabel={(k) => k} real={realBrand} />
      </ChartCard>
      <Card title="Por pneu" icon="pneus">
        <Table minWidth={1100} align={['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right']} head={['Pneu', 'Marca', 'Onde', 'Vida', 'Sulco', 'Desgaste', 'Km na vida', 'Km até retirar', 'R$/1.000 km (vida)', 'R$/1.000 km (total)', '']} rows={perTire.slice(0, more).map(({ t, st }: any) => [<TireTag t={t} />, `${t.brand} ${t.model}`, t.status === 'montado' ? <span className="text-small inline-flex items-center gap-tight whitespace-nowrap"><AssetName name={aName(s, t.assetId)} /> · {t.position}</span> : <span className="text-small text-ink-2">{TIRE_STATUS[t.status].label}</span>, lifeLabel(st.lifeNo), <Level st={st} />, st.rate ? <span className="num">{num(st.rate, 2)} mm</span> : '—', <Num value={st.kmLife} size="body" />, st.kmLeft != null && t.status === 'montado' ? <Num value={st.kmLeft} size="body" /> : '—', st.lifeCpk ? <Money v={st.lifeCpk * 1000} /> : '—', st.cpk ? <Money v={st.cpk * 1000} /> : '—', <TextButton onClick={() => onOpen(t.id)}>Abrir</TextButton>])} />
        {perTire.length > more && <div className="mt-3 flex items-center gap-3"><Button variant="ghost" size="sm" onClick={() => setMore(more + 50)}>Mostrar mais</Button><span className="text-caption text-ink-2 num">{more} de {perTire.length}</span></div>}
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- lista e cadastro
function Lista({ onOpen }: any) {
  const s = useStoreData();
  const R = useTires();
  const all = useAll();
  const [st, setSt] = useState('');
  const [q, setQ] = useState('');
  const [more, setMore] = useState(25);
  const [form, setForm] = useState<any>(null);
  const mark = R.cfg.mark || '';
  const list = all.filter((x: any) => (!st || x.t.status === st) && (!q || (x.t.fireNumber + x.t.brand + x.t.size).toLowerCase().includes(q.toLowerCase())));
  const fire = (n: string) => (mark ? `${mark}-${n}` : n).toUpperCase();
  const dup = form?.number && R.tires.some((t: any) => t.fireNumber === fire(form.number));
  return (
    <>
      <Card title={`Pneus (${list.length})`} icon="pneus" actions={<div className="flex gap-2 flex-wrap items-center"><SearchInput className="w-56" placeholder="Número, marca, medida" value={q} onChange={(v) => { setQ(v); setMore(25); }} aria-label="Buscar pneu" /><Button onClick={() => setForm({ number: '', brand: '', model: '', size: '295/80 R22.5', dot: '', recappable: true, maxLives: 3, cost: '', purchaseDate: toInputD(Date.now()), supplier: '', tread: 18, location: 'Almoxarifado Matriz' })}><Icon name="mais" size={16} />Cadastrar pneu</Button></div>}>
        <div className="mb-4"><Pills value={st} onChange={(k) => { setSt(k); setMore(25); }} options={[{ key: '', label: 'Todos' }, ...Object.entries(TIRE_STATUS).map(([k, v]) => ({ key: k, label: v.label }))]} /></div>
        <Table minWidth={1080} align={['left', 'left', 'left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'right']}
          emptyState={<EmptyState illustration="ilu-busca-veiculo" layout="row" title="Nenhum pneu com esses filtros" detail="Troque a situação ou limpe a busca." />}
          head={['Pneu', 'Marca / modelo', 'Medida', 'Situação', 'Onde', 'Sulco', 'Vida', 'Km rodados', 'Gasto total', 'R$/1.000 km', '']} rows={list.slice(0, more).map(({ t, st: x }: any) => [<TireTag t={t} />, `${t.brand} ${t.model}`, t.size, <StatusDot kind={STATUS_DOT[t.status]} label={TIRE_STATUS[t.status].label} />, t.status === 'montado' ? <span className="text-small inline-flex items-center gap-tight whitespace-nowrap"><AssetName name={aName(s, t.assetId)} /> · {t.position}</span> : <span className="text-small text-ink-2">{t.location || '—'}</span>, <Level st={x} />, <span className="text-small">{lifeLabel(x.lifeNo)}<span className="text-ink-2 num"> · {x.lifeNo}/{t.maxLives}</span></span>, <Num value={x.kmAll} size="body" />, <Money v={x.cost} />, x.cpk ? <Money v={x.cpk * 1000} /> : '—', <TextButton onClick={() => onOpen(t.id)}>Abrir</TextButton>])} />
        {list.length > more && <div className="mt-3 flex items-center gap-3"><Button variant="ghost" size="sm" onClick={() => setMore(more + 50)}>Mostrar mais</Button><span className="text-caption text-ink-2 num">{more} de {list.length}</span></div>}
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title="Cadastrar pneu" width="max-w-3xl" footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button disabled={!form?.number || !form?.cost || dup} onClick={async () => { await R.create({ fire: fire(form.number), brand: form.brand, model: form.model, size: form.size, dot: form.dot, recappable: form.recappable, maxLives: +form.maxLives, cost: +form.cost, supplier: form.supplier, tread: +form.tread, purchasedAt: new Date(form.purchaseDate + 'T12:00').getTime(), location: form.location }); toast(`Pneu ${fire(form.number)} cadastrado no estoque.`); setForm(null); }}>Salvar pneu</Button></>}>
        {form && <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-field">
            <Field label="Número gravado no pneu" hint={dup ? 'Já existe um pneu com este número.' : `Fica ${fire(form.number || '1024')}, com o logo da empresa`}><div className="flex items-center gap-2">{mark && <span className="font-mono font-semibold text-ink-2">{mark}-</span>}<Input className="font-mono" inputMode="numeric" aria-invalid={!!dup} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value.replace(/\s/g, '') })} placeholder="1024" /></div></Field>
            <Field label="Marca"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
            <Field label="Modelo / desenho"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label="Medida"><Input list="tire-sizes" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} /><datalist id="tire-sizes">{['295/80 R22.5', '275/80 R22.5', '215/75 R17.5', '265/60 R18', '175/70 R14'].map((x) => <option key={x} value={x} />)}</datalist></Field>
            <Field label="DOT (semana e ano)"><Input value={form.dot} onChange={(e) => setForm({ ...form, dot: e.target.value })} placeholder="1225" /></Field>
            <Field label="Sulco inicial (mm)"><Input type="number" step="0.1" value={form.tread} onChange={(e) => setForm({ ...form, tread: e.target.value })} /></Field>
            <Field label="Valor de compra (R$)"><Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            <Field label="Data da compra"><Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></Field>
            <Field label="Fornecedor"><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
          </div>
          <Field label="Recapagem"><Pills value={form.recappable ? 'sim' : 'nao'} onChange={(k) => setForm({ ...form, recappable: k === 'sim' })} options={[{ key: 'sim', label: 'Aceita recapagem' }, { key: 'nao', label: 'Não recapável' }]} /></Field>
          {form.recappable && <Field label="Vidas previstas (incluindo a de pneu novo)" hint={`Ex.: 3 = novo, 1ª e 2ª recapagem. Custo projetado: compra + ${Math.max(0, form.maxLives - 1)} recapagem(ns).`} className="max-w-sm"><Input type="number" min={2} max={8} value={form.maxLives} onChange={(e) => setForm({ ...form, maxLives: e.target.value })} /></Field>}
        </>}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- detalhe do pneu: vidas e movimentações
function TireDetail({ id, onClose }: any) {
  const s = useStoreData();
  const R = useTires();
  const [rec, setRec] = useState<any>(null);
  const [scrap, setScrap] = useState('');
  const t = R.tires.find((x: any) => x.id === id);
  if (!t) return null;
  const st = R.stats(t);
  const chart = [...t.measurements].filter((m: any) => m.life === st.lifeNo).sort((a: any, b: any) => a.ts - b.ts).map((m: any) => ({ data: fmtD(m.ts).slice(0, 5), mm: m.mm }));
  const moves = movesOf(t);
  return (
    <Modal open onClose={onClose} title={`Pneu ${t.fireNumber}`} width="max-w-5xl">
      <div className="flex flex-wrap gap-x-4 gap-y-tight items-center"><TireTag t={t} size="md" /><StatusDot kind={STATUS_DOT[t.status]} label={t.status === 'montado' ? `Montado em ${aName(s, t.assetId)} · ${posLabel(t.position)}` : TIRE_STATUS[t.status].label} /><Level st={st} /><span className="text-small text-ink-2">{t.brand} {t.model} · {t.size} · DOT <span className="num">{t.dot || '—'}</span></span></div>
      <Grid cols={4} equal>
        <KpiTile label="Vida atual" display={<span className={numSizeClass('kpi')}>{lifeLabel(st.lifeNo)}</span>} sub={t.recappable ? `${st.lifeNo} de ${t.maxLives} vidas previstas` : 'Não recapável'} />
        <KpiTile label="Km rodados" value={st.kmAll} unit="km" sub={`Nesta vida: ${num(st.kmLife)} km${st.kmLeft != null && t.status === 'montado' ? ` · ≈ ${num(st.kmLeft)} até retirar` : ''}`} />
        <KpiTile label="Gasto até agora" display={<Money v={st.cost} size="kpi" />} sub={`Projetado na vida útil: ${brl(st.projectedCost)}`} />
        <KpiTile label="Custo por 1.000 km" display={<Money v={st.cpk ? st.cpk * 1000 : null} size="kpi" />} sub={st.rate ? `Desgaste de ${num(st.rate, 2)} mm a cada 1.000 km` : 'Meça o sulco para projetar'} />
      </Grid>
      <Grid cols={2} wide equal>
        <ChartCard title="Sulco na vida atual" icon="tendencia" period="mm, a cada medição" sentence={`Linha tracejada: retirada em ${num(st.cfg.removal, 1)} mm. Mínimo legal: ${num(LEGAL_MIN_MM, 1)} mm.`} state={chart.length ? 'ready' : 'empty'} empty={{ title: 'Nenhuma medição nesta vida', detail: 'Meça o sulco em "Por veículo" ou "Medir sulcos".' }}>
          <div className="flex-1 min-h-0 flex flex-col justify-center">
            <LineChart labels={chart.map((m) => m.data)} series={[{ label: 'Sulco', values: chart.map((m) => m.mm), tone: 'real', area: true }]} goal={{ value: st.cfg.removal, label: `Retirada ${num(st.cfg.removal, 1)} mm` }} domain={[0, Math.max(...chart.map((m) => m.mm), st.cfg.removal) * 1.1]} format={(v) => num(v, 0)} height={208} />
          </div>
        </ChartCard>
        <Card title="Vidas" icon="historico">
          <ol className="flex flex-col">
            {t.lives.map((l: any) => { const kmL = sum(t.mounts.filter((m: any) => m.life === l.n).map((m: any) => Math.max(0, (m.kmTo ?? R.kmOf(m.assetId)) - m.kmFrom))); return (
              <li key={l.n} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-stack border-t border-line first:border-t-0 text-body">
                <span className="font-medium">{lifeLabel(l.n)}{l.n === st.lifeNo && t.status !== 'sucata' && <span className="text-ink-2 font-normal"> · atual</span>}</span><Money v={l.cost} />
                <span className="text-caption text-ink-2"><span className="num">{fmtD(l.date)}</span> · {l.supplier}{l.band ? ` · ${l.band}` : ''} · sulco inicial {num(l.tread, 1)} mm</span><span className="text-caption text-ink-2 num text-right">{num(kmL)} km</span>
              </li>); })}
            {Array.from({ length: Math.max(0, t.maxLives - t.lives.length) }).map((_, i) => <li key={'f' + i} className="py-stack border-t border-line text-body text-ink-2">{lifeLabel(t.lives.length + i + 1)} · prevista <span className="num">({brl(st.cfg.recapCost)})</span></li>)}
          </ol>
        </Card>
      </Grid>
      <Card title="Movimentações" icon="historico">
        <ol className="flex flex-col max-h-72 overflow-y-auto">
          {moves.map((m, i) => (
            <li key={i} className="grid grid-cols-[6.5rem_9rem_minmax(0,1fr)] gap-3 py-2 border-t border-line first:border-t-0 text-body">
              <span className="num text-small text-ink-2">{fmtD(m.ts)}</span><span className="font-medium">{MOVE_LABEL[m.kind]}</span>
              <span className="text-ink-2">{m.kind === 'rodizio' ? `${aName(s, m.assetId!)} · ${posLabel(m.fromPos)} → ${posLabel(m.pos)}` : m.assetId ? `${aName(s, m.assetId)} · ${posLabel(m.pos)}` : ''}{m.km != null ? `${m.assetId ? ' · ' : ''}${num(m.km)} km` : ''}{m.detail ? `${m.assetId || m.km != null ? ' · ' : ''}${m.detail}` : ''}</span>
            </li>
          ))}
        </ol>
      </Card>
      <div className="flex flex-wrap gap-3 items-end">
        {t.status === 'estoque' && t.recappable && st.livesLeft > 0 && <Button variant="dark" onClick={async () => { await R.sendRecap(t.id); toast(`${t.fireNumber} enviado à recapadora.`); }}>Enviar para recapagem</Button>}
        {t.status === 'recapagem' && (st.livesLeft > 0 ? <Button onClick={() => setRec({ cost: R.cfg.recapCost || 650, supplier: 'Recapadora Nordeste', band: '', tread: 16 })}>Registrar retorno da recapagem</Button> : <Callout tone="crit">Vidas esgotadas: este pneu não pode ser recapado de novo.</Callout>)}
        {t.status !== 'sucata' && t.status !== 'montado' && <div className="flex gap-2 items-end"><Field label="Motivo do descarte"><Input value={scrap} onChange={(e) => setScrap(e.target.value)} placeholder="Ex.: corte lateral" /></Field><Button variant="danger" disabled={!scrap} onClick={async () => { await R.scrap(t.id, scrap); toast(`${t.fireNumber} descartado.`); }}>Descartar</Button></div>}
        {t.status === 'montado' && <span className="text-small text-ink-2">Para retirar, fazer rodízio ou medir, use "Por veículo".</span>}
      </div>
      {rec && (
        <Panel className="grid grid-cols-2 md:grid-cols-5 gap-field items-end">
          <Field label="Custo (R$)"><Input type="number" value={rec.cost} onChange={(e) => setRec({ ...rec, cost: e.target.value })} /></Field>
          <Field label="Recapadora"><Input value={rec.supplier} onChange={(e) => setRec({ ...rec, supplier: e.target.value })} /></Field>
          <Field label="Banda"><Input value={rec.band} onChange={(e) => setRec({ ...rec, band: e.target.value })} /></Field>
          <Field label="Sulco novo (mm)"><Input type="number" step="0.1" value={rec.tread} onChange={(e) => setRec({ ...rec, tread: e.target.value })} /></Field>
          <Button onClick={async () => { await R.returnRecap(t.id, { cost: +rec.cost, supplier: rec.supplier, band: rec.band, tread: +rec.tread }); toast(`${t.fireNumber} voltou da recapadora: ${lifeLabel(t.lives.length + 1)}.`); setRec(null); }}>Salvar nova vida</Button>
        </Panel>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- estoque
function Estoque({ onOpen }: any) {
  const R = useTires();
  const all = useAll();
  const stock = all.filter((x: any) => ['estoque', 'recapagem'].includes(x.t.status));
  const sizes = [...new Set(all.filter((x: any) => x.t.status !== 'sucata').map((x: any) => x.t.size))].sort();
  const min = R.minStock;
  const rows = sizes.map((size) => { const arr = stock.filter((x: any) => x.t.size === size); const est = arr.filter((x: any) => x.t.status === 'estoque'); return { size, estoque: est.length, novos: est.filter((x: any) => x.st.lifeNo === 1).length, recap: arr.length - est.length, valor: sum(est.map((x: any) => x.st.life.cost)), montados: all.filter((y: any) => y.t.status === 'montado' && y.t.size === size).length }; });
  return (
    <Stack gap="grid">
      <Card title="Estoque por medida" icon="pneus">
        <Table minWidth={900} align={['left', 'right', 'right', 'right', 'right', 'right', 'left', 'right']} head={['Medida', 'Em estoque', 'Novos', 'Recapados', 'Na recapadora', 'Montados na frota', 'Estoque mínimo', 'Valor em estoque']} rows={rows.map((r) => [<span className="font-medium">{r.size}</span>, <span className="num">{r.estoque}</span>, <span className="num">{r.novos}</span>, <span className="num">{r.estoque - r.novos}</span>, <span className="num">{r.recap}</span>, <span className="num">{r.montados}</span>,
          <div className="flex items-center gap-2"><Input className="w-20" type="number" aria-label={`Mínimo ${r.size}`} defaultValue={min[r.size] ?? ''} onBlur={(e) => { if (e.target.value && +e.target.value !== min[r.size]) { R.setMinStock(r.size, +e.target.value); toast(`Estoque mínimo de ${r.size}: ${e.target.value}.`); } }} />{min[r.size] && r.estoque < min[r.size] ? <StatusDot kind="parado" label="Abaixo" /> : null}</div>, <Money v={r.valor} />])} />
      </Card>
      <Card title="Pneus fora da frota" icon="pneus">
        <Table minWidth={760} emptyState={<EmptyState illustration="ilu-pneus" layout="row" title="Nenhum pneu em estoque ou na recapadora" detail="Cadastre pneus em Todos os pneus; os retirados da frota também aparecem aqui." />} head={['Pneu', 'Medida', 'Situação', 'Local', 'Vida', 'Sulco', '']} rows={stock.map(({ t, st }: any) => [<TireTag t={t} />, t.size, <StatusDot kind={STATUS_DOT[t.status]} label={TIRE_STATUS[t.status].label} />, <span className="text-small text-ink-2">{t.location}</span>, lifeLabel(st.lifeNo), <span className="num">{num(st.tread, 1)} mm</span>, <TextButton onClick={() => onOpen(t.id)}>Abrir</TextButton>])} />
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- parâmetros
// Sulcos de alerta e de retirada viram parâmetros do Setup (pneus.sulco_alerta_mm, pneus.sulco_retirada_mm).
// O mínimo legal é piso: a retirada nunca pode ficar abaixo dele, e valor que afrouxa a regra é recusado no campo.
function Config() {
  const R = useTires();
  const [cfg, setCfgL] = useState<any>(R.cfg);
  const [err, setErr] = useState<Record<string, string>>({});
  const check = (c: any) => {
    const e: Record<string, string> = {};
    if (!(c.removal >= LEGAL_MIN_MM)) e.removal = `Não pode ficar abaixo do mínimo legal de ${num(LEGAL_MIN_MM, 1)} mm. Valor salvo mantido: ${num(R.cfg.removal, 1)} mm.`;
    if (!(c.warn > c.removal)) e.warn = `Precisa ser maior que o sulco de retirada (${num(c.removal, 1)} mm). Valor salvo mantido: ${num(R.cfg.warn, 1)} mm.`;
    return e;
  };
  const set = (k: string, v: any) => { const c = { ...cfg, [k]: v }; setCfgL(c); setErr(check(c)); };
  const dirty = ['warn', 'removal', 'recapCost', 'mark', 'markLogo'].some((k) => cfg[k] !== R.cfg[k]);
  const ok = !Object.keys(err).length;
  return (
    <Stack gap="grid">
      <Card title="Sulcos" icon="pneus">
        <div className="grid sm:grid-cols-3 gap-4 max-w-4xl">
          <Field label="Sulco de alerta (mm)" hint={err.warn || 'Abaixo disso o pneu entra em atenção'}><Input type="number" step="0.1" aria-invalid={!!err.warn} className={err.warn ? '!border-crit' : ''} value={cfg.warn} onChange={(e) => set('warn', +e.target.value)} /></Field>
          <Field label="Sulco de retirada (mm)" hint={err.removal || 'Retirar para recapagem ou descarte'}><Input type="number" step="0.1" aria-invalid={!!err.removal} className={err.removal ? '!border-crit' : ''} value={cfg.removal} onChange={(e) => set('removal', +e.target.value)} /></Field>
          <Field label="Mínimo legal (mm)" hint="Fixo por lei (Res. CONTRAN 558/1980). Pneu montado abaixo dele aparece em &quot;Precisa de você&quot;."><Input value={num(LEGAL_MIN_MM, 1)} disabled /></Field>
        </div>
        <p className="text-caption text-ink-2 mt-3">Estes valores passam a vir do Setup de parâmetros; a empresa só pode deixá-los mais rigorosos que o mínimo legal.</p>
      </Card>
      <Card title="Identificação e custos" icon="config">
        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,14rem)] gap-4 max-w-4xl items-start">
          <Field label="Sigla gravada no pneu" hint={`Os novos pneus ficam ${cfg.mark ? `${cfg.mark.toUpperCase()}-1024` : '1024'}`}><Input className="font-mono uppercase" value={cfg.mark} onChange={(e) => set('mark', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} /></Field>
          <Field label="Custo padrão de recapagem (R$)" hint="Usado na projeção da vida útil"><Input type="number" value={cfg.recapCost} onChange={(e) => set('recapCost', +e.target.value)} /></Field>
          <div className="flex flex-col gap-tight"><span className="text-small font-medium text-ink-2">Logo gravado no pneu</span><Dropzone value={cfg.markLogo || undefined} onChange={(d) => set('markLogo', d)} label="Enviar logo" className="h-24" fit="contain" maxMB={1} />{cfg.markLogo && <TextButton tone="danger" className="self-start" onClick={() => set('markLogo', '')}>Remover logo</TextButton>}</div>
        </div>
      </Card>
      <div className="flex gap-3 items-center"><Button disabled={!dirty || !ok} onClick={async () => { await R.setCfg({ warn: cfg.warn, removal: cfg.removal, recapCost: cfg.recapCost, mark: cfg.mark, markLogo: cfg.markLogo }); toast('Parâmetros de pneus salvos.'); }}>Salvar parâmetros</Button>{!ok && <span className="text-small text-crit-ink">Corrija os campos destacados; os valores salvos continuam valendo.</span>}</div>
    </Stack>
  );
}
