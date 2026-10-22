import { RetiredToggle } from '../components/RetiredToggle';
import { opAssets, operatedIn } from '../lib/assetLifecycle';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LTooltip } from 'react-leaflet';
import { useStore, assetKm, useStoreData } from '../lib/store';
import { registerOdometer } from '../lib/odometer';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Tabs, Modal, PageHeader, cx, TextButton, Callout, Radio, Switch, EmptyState, Progress, TabPanel, toast, Grid, Stack } from '../components/ui';
import { Dropzone } from '../components/Dropzone';
import { PeriodCompare, presetValue, periodRanges, rangeText, BI_PRESETS, type PeriodValue } from '../components/PeriodCompare';
import { KpiTile, ChartCard, DeltaChip, StatusDot, Num, AssetName } from '../components/story';
import { CompareBars, ColumnChart, TipItem } from '../components/charts';
import { TILE, ATTR } from '../components/MapBits';
import { Icon } from '../components/icons';
import { FUEL_PARAMS, STATIONS, stationOf, nfCheck, nfStatus, reliability, kmDiff, validKey, parseNfeXml, goalFor, monthSpend, withKml, DIV_LABEL } from '../lib/fuel';
import { brl, fmtD, fmtDT, num, pct, monthKey, monthLabel, sum, toInputDT, uid, groupBy, abbr } from '../lib/utils';

const FUELS = ['Diesel S10', 'Diesel S500', 'Gasolina', 'Etanol', 'GNV', 'Arla 32'];
const NF_DOT: Record<string, { kind: 'mov' | 'crit' | 'off'; label: string }> = { conferida: { kind: 'mov', label: 'Conferida' }, divergente: { kind: 'crit', label: 'Divergente' }, sem_nota: { kind: 'off', label: 'Sem nota' } };
const brlShort = (v: number) => `R$ ${abbr(v)}`;

export default function Combustivel() {
  const [tab, setTab] = useState('lanc');
  return (
    <div>
      <PageHeader icon="combustivel" title="Gestão de combustível" subtitle="Abastecimentos, notas fiscais, confiabilidade, metas e BI de consumo" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head"><RetiredToggle /><Tabs value={tab} onChange={setTab} tabs={[{ key: 'lanc', label: 'Abastecimentos' }, { key: 'notas', label: 'Notas fiscais' }, { key: 'bi', label: 'BI de abastecimento' }, { key: 'metas', label: 'Metas' }]} /></div>
      <TabPanel id={tab}>
        {tab === 'lanc' && <Lancamentos />}
        {tab === 'notas' && <Notas />}
        {tab === 'bi' && <BI />}
        {tab === 'metas' && <Metas />}
      </TabPanel>
    </div>
  );
}

// ---------------------------------------------------------------- abastecimentos
function Lancamentos() {
  const fuelings = useStore((s) => s.fuelings);
  const assets = useStore((s) => s.assets);
  const drivers = useStore((s) => s.drivers);
  const [open, setOpen] = useState(false);
  const [aid, setAid] = useState('');
  const list = [...fuelings].filter((f: any) => !aid || f.assetId === aid).sort((a: any, b: any) => b.ts - a.ts).slice(0, 150);
  const n = (id: string) => assets.find((a: any) => a.id === id)?.name;
  return (
    <>
      <Card title="Abastecimentos" icon="combustivel" actions={<div className="flex gap-2"><div className="w-48"><SearchSelect aria-label="Veículo" value={aid} onChange={setAid} placeholder="Todos os veículos" options={assets.filter((a: any) => a.kind === 'veiculo').map((a: any) => ({ value: a.id, label: a.name }))} /></div><Button onClick={() => setOpen(true)}><Icon name="mais" size={16} />Lançar abastecimento</Button></div>}>
        <Table minWidth={980} align={['left', 'left', 'left', 'right', 'right', 'right', 'right', 'left', 'left']}
          emptyState={<EmptyState illustration="ilu-combustivel" layout="row" title="Nenhum abastecimento lançado" detail={aid ? 'Este veículo ainda não tem abastecimentos. Troque o veículo ou lance um abastecimento.' : 'Lance o primeiro abastecimento para acompanhar consumo e gasto.'} />}
          head={['Data', 'Veículo', 'Motorista', 'Km', 'Litros', 'Valor', 'R$/L', 'Posto', 'Nota']} rows={list.map((f: any) => {
          const st = nfStatus(f);
          return [<span className="num whitespace-nowrap">{fmtDT(f.ts)}</span>, <AssetName name={n(f.assetId)} />, drivers.find((d: any) => d.id === f.driverId)?.name || '—', <span><Num value={f.odometer} size="body" />{Math.abs(kmDiff(f) ?? 0) > FUEL_PARAMS.tolKm && <span className="block text-caption text-loss-ink num">rastreador {num(f.kmTracker)} km</span>}</span>, <Num value={f.liters} digits={2} size="body" />, <Num value={f.total} prefix="R$" digits={2} size="body" />, <Num value={f.pricePerL} prefix="R$" digits={2} size="body" />, <span className="text-small">{f.station}</span>, <StatusDot kind={NF_DOT[st].kind} label={NF_DOT[st].label} />];
        })} />
        {list.length > 0 && <p className="text-caption text-ink-2 mt-2">Mostrando os 150 mais recentes.</p>}
      </Card>
      {open && <FuelForm onClose={() => setOpen(false)} />}
    </>
  );
}

// Lançamento com o mínimo de digitação: veículo, litros e valor. O km vem do rastreador quando houver;
// motorista, combustível e posto vêm preenchidos do vínculo e do último abastecimento.
function FuelForm({ onClose }: any) {
  const s = useStoreData();
  const vehs = opAssets(s).filter((a: any) => a.kind === 'veiculo');
  const lastOf = (assetId: string) => s.fuelings.filter((x: any) => x.assetId === assetId).reduce((m: any, x: any) => (!m || x.odometer > m.odometer ? x : m), null);
  const init = (assetId: string) => { const a = vehs.find((x: any) => x.id === assetId); const l = lastOf(assetId); const trk = a?.tracker && s.vehicles[assetId] ? Math.round(assetKm(s, assetId)) : ''; return { assetId, driverId: a?.driverId || '', ts: toInputDT(Date.now()), odometer: trk ? String(trk) : '', fromTracker: !!trk, kmTracker: trk || null, liters: '', total: '', fuel: l?.fuel || 'Diesel S10', stationId: l?.stationId || STATIONS[0].id, photos: [] }; };
  const [f, setF] = useState<any>(() => init(vehs[0]?.id));
  const last = useMemo(() => lastOf(f.assetId), [f.assetId]);
  const asset = vehs.find((a: any) => a.id === f.assetId);
  const price = +f.liters > 0 ? +f.total / +f.liters : 0;
  const odo = +f.odometer;
  const jump = FUEL_PARAMS.kmJumpMax;
  const err = !f.odometer ? '' : last && odo < last.odometer ? `O km não pode ser menor que o último lançado (${num(last.odometer)} km em ${fmtD(last.ts)}).` : last && odo - last.odometer > jump ? `Diferença de ${num(odo - last.odometer)} km desde o último abastecimento. O limite é ${num(jump)} km: confira o km.` : '';
  const corr = f.kmTracker != null && odo ? odo - f.kmTracker : 0; // correção do km do rastreador, gravada no lançamento
  const kml = last && odo > last.odometer && +f.liters ? (odo - last.odometer) / +f.liters : 0;
  const goal = goalFor(s, asset);
  const spent = monthSpend(s, (x) => x.assetId === f.assetId) + (+f.total || 0);
  const overBudget = asset?.fuelBudget && spent > asset.fuelBudget;
  const ok = !err && odo && +f.liters > 0 && +f.total > 0;
  const st = STATIONS.find((p) => p.id === f.stationId)!;
  const save = () => {
    const { fromTracker, ...rest } = f;
    s.upsert('fuelings', { ...rest, id: uid('fu'), ts: new Date(f.ts).getTime(), odometer: odo, liters: +f.liters, total: +f.total, pricePerL: +price.toFixed(3), station: st.name });
    registerOdometer(f.assetId, odo, 'abastecimento', s.drivers.find((d: any) => d.id === f.driverId)?.name);
    toast('Abastecimento lançado.', overBudget ? { detail: `O veículo passou do teto mensal indicativo (${brl(asset.fuelBudget)}).` } : {});
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Lançar abastecimento" width="max-w-3xl" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!ok} onClick={save}>Salvar abastecimento</Button></>}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-field">
        <Field label="Veículo"><SearchSelect value={f.assetId} onChange={(v) => setF({ ...init(v), liters: f.liters, total: f.total, photos: f.photos })} options={vehs.map((a: any) => ({ value: a.id, label: a.name }))} /></Field>
        <Field label="Litros"><Input type="number" step="0.01" inputMode="decimal" autoFocus value={f.liters} onChange={(e) => setF({ ...f, liters: e.target.value })} /></Field>
        <Field label="Valor total (R$)"><Input type="number" step="0.01" inputMode="decimal" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} /></Field>
        <Field label="Km atual" hint={f.kmTracker != null ? (corr ? `Rastreador marcava ${num(f.kmTracker)} km; correção de ${corr > 0 ? '+' : ''}${num(corr)} km fica registrada` : 'Lido do rastreador agora; corrija se o painel mostrar outro valor') : last ? `Último: ${num(last.odometer)} km` : 'Primeiro lançamento'}><Input type="number" value={f.odometer} aria-invalid={!!err} className={err ? '!border-crit' : ''} onChange={(e) => setF({ ...f, odometer: e.target.value, fromTracker: false })} /></Field>
        <Field label="Combustível"><Select value={f.fuel} onChange={(e) => setF({ ...f, fuel: e.target.value })} options={FUELS} /></Field>
        <Field label="Posto"><Select value={f.stationId} onChange={(e) => setF({ ...f, stationId: e.target.value })} options={STATIONS.map((p) => ({ value: p.id, label: `${p.name} · ${p.city}` }))} /></Field>
        <Field label="Motorista"><SearchSelect value={f.driverId} onChange={(v) => setF({ ...f, driverId: v })} placeholder="—" options={s.drivers.map((d: any) => ({ value: d.id, label: d.name }))} /></Field>
        <Field label="Data e hora"><Input type="datetime-local" value={f.ts} onChange={(e) => setF({ ...f, ts: e.target.value })} /></Field>
      </div>
      {err && <Callout tone="crit">{err}</Callout>}
      {!err && Math.abs(corr) > FUEL_PARAMS.tolKm && <Callout>O km lançado difere {num(Math.abs(corr))} km do rastreador. Acima de {num(FUEL_PARAMS.tolKm)} km, a correção entra no índice de confiabilidade como "km diferente do rastreador".</Callout>}
      {overBudget && <Callout>Com este abastecimento, o veículo passa do teto mensal indicativo de {brl(asset.fuelBudget)} ({brl(spent)} no mês). O lançamento continua permitido.</Callout>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-field">
        <KpiTile label="Valor do litro" display={<Num value={price || null} prefix="R$" digits={2} size="kpi" count />} />
        <KpiTile label="Consumo deste tanque" value={kml || null} unit="km/L" digits={2} status={kml && goal ? (kml < goal.kml ? 'parado' : undefined) : undefined} sub={kml && goal ? (kml >= goal.kml ? 'Dentro da meta' : `${num((kml / goal.kml - 1) * 100, 0)}% abaixo da meta`) : 'Calculado ao informar km e litros'} />
        <KpiTile label="Meta de consumo" value={goal?.kml ?? null} unit="km/L" digits={1} sub={goal ? `Meta ${({ 'veículo': 'do veículo', 'operação': 'da operação', grupo: 'do grupo', empresa: 'da empresa' } as Record<string, string>)[goal.from]}` : 'Sem meta'} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-small font-medium text-ink-2">Fotos (bomba, painel, nota fiscal)</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {f.photos.map((p: any) => (
            <div key={p.id} className={cx('rounded-ctl p-2 flex flex-col gap-tight border', p.isNota ? 'border-ink' : 'border-line')}>
              <img src={p.data} alt="" loading="lazy" decoding="async" className="w-full h-24 object-cover rounded-chip" />
              <Radio name="nota" label="Esta é a nota fiscal" checked={p.isNota} onChange={() => setF({ ...f, photos: f.photos.map((x: any) => ({ ...x, isNota: x.id === p.id })) })} />
              <TextButton tone="danger" className="self-start" onClick={() => setF({ ...f, photos: f.photos.filter((x: any) => x.id !== p.id) })}>Remover</TextButton>
            </div>
          ))}
          <Dropzone multiple label="Adicionar fotos" className="h-36" onChange={(d) => setF((cur: any) => ({ ...cur, photos: [...cur.photos, { id: uid('ph'), data: d, isNota: cur.photos.length === 0 }] }))} />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- notas fiscais e confiabilidade
function Notas() {
  const s = useStoreData();
  const [flt, setFlt] = useState('pendentes');
  const [edit, setEdit] = useState<any>(null);
  const [more, setMore] = useState(25);
  const [period, setPeriod] = useState<PeriodValue>(() => presetValue(BI_PRESETS[2], 'nenhum'));
  const { a } = periodRanges(period);
  const ocrOn = !!s.fuelCfg?.ocr;
  const all = [...s.fuelings].sort((x: any, y: any) => y.ts - x.ts);
  const list = all.filter((f: any) => (flt === 'pendentes' ? nfStatus(f) !== 'conferida' : flt === 'divergentes' ? nfStatus(f) === 'divergente' : true));
  const shown = list.slice(0, more);
  const rel = useMemo(() => reliability(s, a[0], a[1]), [s.fuelings, JSON.stringify(period)]);
  const nm = (id: string) => s.assets.find((x: any) => x.id === id)?.name || '';
  const withIdx = rel.filter((r) => r.index != null);
  const worst = withIdx[0];
  const relSentence = !withIdx.length ? 'Ainda não há lançamentos conferidos suficientes no período para calcular o índice (mínimo de 3 por motorista).'
    : worst.index! < 0.9 ? `${worst.name} tem o menor índice (${pct(worst.index!, 0)}): ${worst.divergent} de ${worst.withNf} lançamentos conferidos têm divergência${Object.keys(worst.byKind).length ? `, principalmente em ${Object.entries(worst.byKind).sort((x: any, y: any) => y[1] - x[1]).map(([k]) => DIV_LABEL[k as 'litros'].toLowerCase())[0]}` : ''}.`
    : 'Todos os motoristas com lançamentos conferidos estão acima de 90% de confiabilidade.';
  return (
    <Stack gap="grid">
      <ChartCard title="Índice de confiabilidade do motorista" icon="usuario" period={rangeText(a)} sentence={relSentence} aside={<PeriodCompare value={period} onChange={setPeriod} modes={['nenhum']} />} state={rel.length ? 'ready' : 'empty'} empty={{ title: 'Sem abastecimentos no período' }}>
        <p className="text-small text-ink-2 mb-3 max-w-[90ch]">Compara a nota fiscal e o km do rastreador com o que o motorista lançou. Tolerâncias: litros ±{FUEL_PARAMS.tolLitersPct}%, valor ±{brl(FUEL_PARAMS.tolValue)}, data ±{FUEL_PARAMS.tolDays} dia e mesmo posto (CNPJ). Também entra a correção do km lido do rastreador acima de {num(FUEL_PARAMS.tolKm)} km. Uma divergência pode ser erro de digitação ou fraude, e a lista ajuda a separar os casos.</p>
        <Table minWidth={820} align={['left', 'left', 'right', 'right', 'left', 'left']} head={['Motorista', 'Índice', 'Lançamentos conferidos', 'Divergências', 'Por tipo', 'Última divergência']} rows={rel.map((r) => [
          <span className="font-medium">{r.name}</span>,
          r.index == null ? <span className="text-small text-ink-2">Poucas notas</span> : <div className="flex items-center gap-2 min-w-[140px]"><Progress className="h-2 flex-1" value={r.index} color={r.index < 0.9 ? 'var(--loss)' : 'var(--ink-2)'} label={`Índice ${pct(r.index, 0)}`} /><span className="num w-10 text-right">{pct(r.index, 0)}</span></div>,
          <span className="num">{r.withNf} de {r.fuelings}</span>, <span className={cx('num', r.divergent && 'text-loss-ink')}>{r.divergent}</span>,
          <span className="text-caption text-ink-2">{Object.entries(r.byKind).map(([k, v]) => `${DIV_LABEL[k as 'litros']} ${v}`).join(' · ') || '—'}</span>,
          r.last ? <span className="text-caption"><span className="num">{fmtD(r.last.f.ts)}</span> · {r.last.d.map((d: any) => d.detail).join('; ')}</span> : '—'])} />
      </ChartCard>
      <Card title="Notas fiscais" icon="documento" actions={<Tabs value={flt} onChange={(k) => { setFlt(k); setMore(25); }} tabs={[{ key: 'pendentes', label: 'Sem nota ou divergentes' }, { key: 'divergentes', label: 'Divergentes' }, { key: 'todas', label: 'Todas' }]} />}>
        <p className="text-small text-ink-2 mb-3 max-w-[90ch]">Informe a nota pela chave de acesso, enviando o XML ou digitando os dados. A busca automática pela chave na SEFAZ fica preparada para quando o custo da integração for aprovado.</p>
        <Table minWidth={980} emptyState={<EmptyState illustration="ilu-combustivel" layout="row" title="Nenhum abastecimento nesta lista" detail={flt === 'todas' ? 'Ainda não há abastecimentos lançados.' : 'Todas as notas conferem. Veja a lista completa em Todas.'} />} head={['Data', 'Veículo', 'Motorista', 'Lançado', 'Nota', 'Situação', '']} rows={shown.map((f: any) => {
          const st = nfStatus(f); const d = nfCheck(f);
          return [<span className="num">{fmtD(f.ts)}</span>, <AssetName name={nm(f.assetId)} />, s.drivers.find((x: any) => x.id === f.driverId)?.name || '—',
            <span className="text-small num">{num(f.liters, 2)} L · {brl(f.total)}</span>, f.nf ? <span className="text-small num">{f.nf.liters != null ? `${num(f.nf.liters, 2)} L · ` : ''}{f.nf.total != null ? brl(f.nf.total) : ''}{f.nf.source === 'xml' ? ' · XML' : ''}</span> : <span className="text-ink-3">—</span>,
            <span><StatusDot kind={NF_DOT[st].kind} label={NF_DOT[st].label} />{d.length > 0 && <span className="block text-caption text-ink-2">{d.map((x) => x.detail).join('; ')}</span>}</span>,
            <TextButton onClick={() => setEdit(f)}>{f.nf ? 'Ver nota' : 'Informar nota'}</TextButton>];
        })} />
        {list.length > more && <div className="mt-3 flex items-center gap-3"><Button variant="secondary" size="sm" onClick={() => setMore(more + 50)}>Mostrar mais</Button><span className="text-caption text-ink-2 num">{more} de {list.length}</span></div>}
      </Card>
      <Card title="Leitura automática da foto (OCR)" icon="camera">
        <div className="flex flex-wrap items-center gap-3"><label className="inline-flex items-center gap-2 text-body font-medium"><Switch checked={ocrOn} aria-label="Ler a foto da nota com OCR" onChange={(v) => s.patch((st: any) => ({ fuelCfg: { ...(st.fuelCfg || {}), ocr: v } }))} />Ler a foto da nota com OCR</label><span className="text-small text-ink-2">Desligado por padrão: a reunião adiou o OCR pelo custo. Quando ligado, usa o Tesseract no navegador, sem custo de API, mas com precisão limitada.</span></div>
      </Card>
      {edit && <NotaModal f={edit} ocrOn={ocrOn} onClose={() => setEdit(null)} />}
    </Stack>
  );
}

function NotaModal({ f, ocrOn, onClose }: any) {
  const s = useStoreData();
  const st = stationOf(f);
  const [n, setN] = useState<any>(() => ({ chave: '', liters: '', total: '', cnpj: '', source: 'manual', ...(f.nf || {}), dateIso: f.nf?.date, date: f.nf?.date ? f.nf.date.slice(0, 10) : '' }));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const nota = f.photos?.find((p: any) => p.isNota);
  const keyOk = !n.chave || validKey(n.chave);
  const preview = { ...f, nf: { ...n, liters: n.liters === '' ? null : +n.liters, total: n.total === '' ? null : +n.total, date: n.date ? new Date(n.date + 'T12:00').toISOString() : '' } };
  const div = nfCheck(preview);
  const onXml = (data: string) => {
    try {
      const xml = decodeURIComponent(escape(atob(data.split(',')[1] || '')));
      const x = parseNfeXml(xml);
      setN({ ...n, chave: x.chave, liters: x.liters ?? '', total: x.total ?? '', date: x.date ? x.date.slice(0, 10) : '', cnpj: x.cnpj, source: 'xml', product: x.product, emitente: x.station, city: x.city, uf: x.uf, bairro: x.bairro });
      setMsg(`XML lido: ${x.station || 'emitente'}${x.city ? `, ${x.city}/${x.uf}` : ''}.`);
    } catch (e: any) { setMsg('Erro: ' + e.message); }
  };
  const ocr = async () => {
    setBusy(true);
    try {
      const T: any = await import('tesseract.js');
      const text = (await T.recognize(nota.data, 'por')).data.text as string;
      const total = text.match(/(?:TOTAL|VALOR)[^\d]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2})/i)?.[1];
      const cnpj = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0];
      const key = text.replace(/\s/g, '').match(/\d{44}/)?.[0];
      setN({ ...n, total: total ? total.replace(/\./g, '').replace(',', '.') : n.total, cnpj: cnpj || n.cnpj, chave: key || n.chave, source: 'ocr' });
      setMsg(total || cnpj ? 'OCR leu parte dos dados. Confira antes de salvar.' : 'O OCR não identificou os dados. Preencha manualmente.');
    } catch (e: any) { setMsg('Erro: não foi possível ler a foto. ' + (e?.message || '')); }
    setBusy(false);
  };
  const save = () => { s.upsert('fuelings', { id: f.id, nf: preview.nf }); toast(div.length ? 'Nota salva com divergência.' : 'Nota conferida.', div.length ? { tone: 'crit', detail: div.map((d) => d.detail).join('; ') } : {}); onClose(); };
  return (
    <Modal open onClose={onClose} title="Nota fiscal do abastecimento" width="max-w-4xl" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!keyOk || (n.total === '' && n.liters === '')} onClick={save}>Salvar nota</Button></>}>
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-group">
        <div className="flex flex-col gap-3">
          <p className="text-small text-ink-2">Lançado: <span className="font-semibold text-ink num">{num(f.liters, 2)} L · {brl(f.total)}</span> em <span className="num">{fmtDT(f.ts)}</span> · {st?.name}{st ? <> (CNPJ <span className="num">{st.cnpj}</span>)</> : ''}</p>
          {nota ? <img src={nota.data} alt="Foto da nota fiscal" className="w-full max-h-80 object-contain rounded-ctl border border-line" /> : <p className="text-small text-ink-2">Nenhuma foto marcada como nota fiscal neste lançamento.</p>}
          {nota && ocrOn && <Button variant="secondary" loading={busy} onClick={ocr}>{busy ? 'Lendo a foto…' : 'Ler a foto (OCR)'}</Button>}
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Chave de acesso (44 dígitos)" hint={keyOk ? undefined : 'Chave inválida: confira os dígitos.'}><Input value={n.chave} inputMode="numeric" aria-invalid={!keyOk} className={cx('font-mono', !keyOk && '!border-crit')} onChange={(e) => setN({ ...n, chave: e.target.value.replace(/\D/g, '').slice(0, 44) })} /></Field>
          <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" disabled title="Integração com a SEFAZ: custo em avaliação">Buscar na SEFAZ</Button><span className="text-caption text-ink-2">Disponível quando a integração for contratada.</span></div>
          <Dropzone accept=".xml,text/xml,application/xml" maxMB={2} label="Enviar o XML da NF-e" className="h-24" fileName={n.source === 'xml' ? 'XML importado' : undefined} onChange={onXml} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
            <Field label="Litros na nota"><Input type="number" step="0.01" value={n.liters} onChange={(e) => setN({ ...n, liters: e.target.value })} /></Field>
            <Field label="Valor da nota (R$)"><Input type="number" step="0.01" value={n.total} onChange={(e) => setN({ ...n, total: e.target.value })} /></Field>
            <Field label="Data de emissão"><Input type="date" value={n.date} onChange={(e) => setN({ ...n, date: e.target.value })} /></Field>
            <Field label="CNPJ do posto"><Input value={n.cnpj} placeholder="00.000.000/0001-00" onChange={(e) => setN({ ...n, cnpj: e.target.value })} /></Field>
          </div>
          {msg && (msg.startsWith('Erro') ? <Callout tone="crit">{msg}</Callout> : <p role="status" className="text-small text-ink-2">{msg}</p>)}
          {(n.total !== '' || n.liters !== '') && (div.length ? <Callout tone="crit">Divergência com o lançamento: {div.map((d) => d.detail).join('; ')}.</Callout> : <p className="text-small text-ink-2">A nota confere com o lançamento dentro das tolerâncias.</p>)}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- BI
function BI() {
  const s = useStoreData();
  const [period, setPeriod] = useState<PeriodValue>(() => presetValue(BI_PRESETS[2], 'anterior'));
  const [flt, setFlt] = useState({ grp: '', op: '', brand: '', model: '' });
  const [reg, setReg] = useState('cidade');
  const { a, b } = periodRanges(period);
  // BI: vendidos/baixados contam nos períodos em que operaram
  const vehs = s.assets.filter((x: any) => x.kind === 'veiculo' && operatedIn(x, Math.min(a[0], b?.[0] ?? a[0])));
  const opts = (k: string, label: string) => [{ value: '', label }, ...[...new Set(vehs.map((x: any) => x[k]).filter(Boolean))].map((v: any) => ({ value: v, label: v }))];
  const sel = vehs.filter((x: any) => (!flt.grp || x.groupIds.includes(flt.grp)) && (!flt.op || x.operationId === flt.op) && (!flt.brand || x.brand === flt.brand) && (!flt.model || x.model === flt.model));
  const ids = sel.map((x: any) => x.id);
  const all = useMemo(() => withKml(s.fuelings), [s.fuelings]);
  const calc = (r: [number, number] | null) => {
    if (!r) return null;
    const rows = all.filter((x: any) => ids.includes(x.assetId) && x.ts >= r[0] && x.ts <= r[1]);
    const liters = sum(rows.map((x: any) => x.liters)), total = sum(rows.map((x: any) => x.total)), km = sum(rows.map((x: any) => x.km));
    const lk = sum(rows.filter((x: any) => x.km > 0).map((x: any) => x.liters));
    const perVeh = sel.map((v: any) => { const rr = rows.filter((x: any) => x.assetId === v.id); const l = sum(rr.filter((x: any) => x.km > 0).map((x: any) => x.liters)); const k = sum(rr.map((x: any) => x.km)); return { id: v.id, name: v.name, model: v.model, total: sum(rr.map((x: any) => x.total)), liters: sum(rr.map((x: any) => x.liters)), km: k, kml: l ? k / l : null, goal: goalFor(s, v) }; });
    const months: Record<string, number> = {}; rows.forEach((x: any) => { const k = monthKey(x.ts); months[k] = (months[k] || 0) + x.total; });
    const hit = perVeh.filter((v) => v.kml && v.goal); const inGoal = hit.filter((v) => v.kml! >= v.goal!.kml).length;
    return { rows, liters, total, km, kml: lk ? km / lk : null, price: liters ? total / liters : null, perKm: km ? total / km : null, perVeh, months, inGoal, withGoal: hit.length };
  };
  const A = calc(a)!, B = calc(b);
  const rel = (x?: number | null, y?: number | null) => (x == null || y == null || !y ? null : ((x - y) / y) * 100);
  // gasto mensal com o período anterior alinhado por posição do mês
  const mk = Object.keys(A.months).sort(); const mkB = B ? Object.keys(B.months).sort() : [];
  const monthRows = mk.map((k, i) => ({ label: monthLabel(k), value: Math.round(A.months[k]), prev: B && mkB[i] ? Math.round(B.months[mkB[i]]) : 0 }));
  const vk = A.perVeh.filter((v) => v.kml).sort((x, y) => (x.kml! / (x.goal?.kml || x.kml!)) - (y.kml! / (y.goal?.kml || y.kml!)));
  const below = vk.filter((v) => v.goal && v.kml! < v.goal.kml);
  const kmlSentence = !vk.length ? 'Sem consumo calculado no período.' : below.length ? `${below.length} de ${vk.length} veículos abaixo da meta; ${below[0].name} está ${num((1 - below[0].kml! / below[0].goal!.kml) * 100, 0)}% abaixo (${num(below[0].kml!, 2)} contra ${num(below[0].goal!.kml, 1)} km/L).` : `Todos os ${vk.length} veículos com consumo calculado estão na meta.`;
  // preço e consumo por região, a partir das notas e dos postos
  const regKey = (st: any) => (reg === 'uf' ? st.uf : reg === 'cidade' ? `${st.city}/${st.uf}` : `${st.bairro}, ${st.city}/${st.uf}`);
  const byReg = Object.entries(groupBy(A.rows.filter((f: any) => stationOf(f)), (f: any) => regKey(stationOf(f)))).map(([k, rr]: any) => {
    const l = sum(rr.map((x: any) => x.liters)), t = sum(rr.map((x: any) => x.total)); const lk = sum(rr.filter((x: any) => x.km > 0).map((x: any) => x.liters));
    return { k, liters: l, price: l ? t / l : 0, kml: lk ? sum(rr.map((x: any) => x.km)) / lk : null, n: rr.length };
  }).sort((x, y) => x.price - y.price);
  const bySt = STATIONS.map((p) => { const rr = A.rows.filter((f: any) => stationOf(f)?.id === p.id); const l = sum(rr.map((x: any) => x.liters)); return { p, liters: l, price: l ? sum(rr.map((x: any) => x.total)) / l : 0 }; }).filter((x) => x.liters);
  const pMin = Math.min(...bySt.map((x) => x.price)), pMax = Math.max(...bySt.map((x) => x.price));
  const maxL = Math.max(1, ...bySt.map((x) => x.liters));
  const regSentence = byReg.length > 1 ? `O litro mais barato saiu em ${byReg[0].k} (${brl(byReg[0].price)}) e o mais caro em ${byReg[byReg.length - 1].k} (${brl(byReg[byReg.length - 1].price)}), uma diferença de ${pct(byReg[byReg.length - 1].price / byReg[0].price - 1, 1)}.` : 'Abastecimentos de uma região só no período.';
  return (
    <Stack gap="grid">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44"><Select aria-label="Grupo" value={flt.grp} onChange={(e) => setFlt({ ...flt, grp: e.target.value })} options={[{ value: '', label: 'Todos os grupos' }, ...s.groups.map((g: any) => ({ value: g.id, label: g.name }))]} /></div>
        <div className="w-48"><Select aria-label="Tipo de operação" value={flt.op} onChange={(e) => setFlt({ ...flt, op: e.target.value })} options={[{ value: '', label: 'Todas as operações' }, ...s.operations.map((o: any) => ({ value: o.id, label: o.name }))]} /></div>
        <div className="w-40"><Select aria-label="Marca" value={flt.brand} onChange={(e) => setFlt({ ...flt, brand: e.target.value })} options={opts('brand', 'Todas as marcas')} /></div>
        <div className="w-48"><Select aria-label="Modelo" value={flt.model} onChange={(e) => setFlt({ ...flt, model: e.target.value })} options={opts('model', 'Todos os modelos')} /></div>
        <span className="text-small text-ink-2 num mr-auto">{sel.length} veículos · {A.rows.length} abastecimentos</span>
        <PeriodCompare value={period} onChange={setPeriod} />
      </div>
      <Grid cols={5} equal>
        <KpiTile label="Gasto" display={<Num value={A.total} prefix="R$" size="kpi" count />} delta={{ value: rel(A.total, B?.total), unit: '%', good: 'down' }} sub={`${num(A.liters)} litros`} />
        <KpiTile label="Preço médio do litro" display={<Num value={A.price} prefix="R$" digits={2} size="kpi" count />} delta={{ value: rel(A.price, B?.price), unit: '%', good: 'down' }} />
        <KpiTile label="Consumo médio" value={A.kml} unit="km/L" digits={2} delta={{ value: rel(A.kml, B?.kml), unit: '%', good: 'up' }} sub={s.fuelGoals?.company?.kml ? `Meta da empresa ${num(s.fuelGoals.company.kml, 1)} km/L` : undefined} />
        <KpiTile label="Custo por km" display={<Num value={A.perKm} prefix="R$" digits={2} size="kpi" count />} delta={{ value: rel(A.perKm, B?.perKm), unit: '%', good: 'down' }} sub={<><Num value={A.km} unit="km" size="small" /> rodados</>} />
        <KpiTile label="Veículos na meta" value={A.withGoal ? (A.inGoal / A.withGoal) * 100 : null} unit="%" sub={`${A.inGoal} de ${A.withGoal} com meta`} />
      </Grid>
      <Grid cols={2} wide equal>
        <ChartCard title="Gasto por mês" icon="grafico" state={monthRows.length ? 'ready' : 'empty'} empty={{ title: 'Sem abastecimentos no período' }}
          sentence={monthRows.length ? `${brl(A.total).replace(/,\d\d$/, '')} no período${B?.total ? `, ${pct(Math.abs(A.total / B.total - 1), 1)} ${A.total > B.total ? 'acima' : 'abaixo'} do período anterior` : ''}.` : undefined}>
          {B ? <CompareBars groups={monthRows.map((r) => ({ label: r.label, cur: r.value, prev: r.prev }))} format={abbr} curLabel="Período atual" prevLabel="Período anterior" height={220} />
            : <ColumnChart data={monthRows} format={brlShort} height={220} label="Gasto" />}
        </ChartCard>
        <ChartCard title="Consumo por veículo × meta" icon="combustivel" sentence={kmlSentence} state={vk.length ? 'ready' : 'empty'} empty={{ title: 'Sem consumo calculado' }}>
          <ul className="flex flex-col gap-1">
            {vk.map((v, i) => { const max = Math.max(v.kml!, v.goal?.kml || 0) * 1.15; const low = v.goal && v.kml! < v.goal.kml; return (
              <TipItem title={v.name} rows={[{ label: 'Consumo', value: `${num(v.kml!, 2)} km/L`, strong: true }, ...(v.goal ? [{ label: `Meta (${v.goal.from})`, value: `${num(v.goal.kml, 1)} km/L`, tone: 'muted' as const }] : [])]} foot={v.goal ? (low ? `${num((1 - v.kml! / v.goal.kml) * 100, 0)}% abaixo da meta` : 'Na meta') : undefined} key={v.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 py-tight">
                <span className="min-w-0 flex flex-col items-start gap-hair"><AssetName name={v.name} /><span className="block text-caption text-ink-2 truncate max-w-full">{v.model}</span></span>
                <span className="relative h-2.5 rounded-pill bg-track"><span className={cx('block h-full rounded-pill grow-x', low ? 'fill-loss' : 'fill-real')} style={{ width: `${(v.kml! / max) * 100}%`, ['--i' as any]: i }} />{v.goal && <span aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 rounded-pill bg-ink" style={{ left: `calc(${(v.goal.kml / max) * 100}% - 1px)` }} />}</span>
                <span className="text-right whitespace-nowrap min-w-[7rem]"><Num value={v.kml} digits={2} unit="km/L" size="body" className="font-semibold" />{v.goal && <span className="block text-caption text-ink-2 num">meta {num(v.goal.kml, 1)}</span>}</span>
              </TipItem>); })}
          </ul>
          <p className="text-caption text-ink-2 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1"><span className="inline-flex items-center gap-tight"><span aria-hidden="true" className="w-0.5 h-3 rounded-pill bg-ink" />Meta (do veículo, da operação, do grupo ou da empresa)</span><span className="inline-flex items-center gap-tight"><span aria-hidden="true" className="w-3 h-3 rounded-chip fill-loss" />Abaixo da meta</span></p>
        </ChartCard>
      </Grid>
      <ChartCard title="Preço e consumo por região" icon="rota" sentence={regSentence} state={bySt.length ? 'ready' : 'empty'} empty={{ title: 'Sem abastecimentos com posto identificado' }}>
        <Grid split="7/5" wide>
          <div className="h-[360px] rounded-ctl overflow-hidden border border-line">
            <MapContainer center={[-8.1, -35.1]} zoom={8} className="h-full w-full" scrollWheelZoom={false}>
              <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
              {bySt.map(({ p, liters, price }) => { const k = pMax > pMin ? (price - pMin) / (pMax - pMin) : 0; return (
                <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={6 + 14 * Math.sqrt(liters / maxL)} pathOptions={{ color: 'var(--card)', weight: 1.5, fillOpacity: 0.85, fillColor: `color-mix(in srgb, var(--loss) ${Math.round(k * 100)}%, var(--real))` }}>
                  <LTooltip>{p.name} · {p.city}/{p.uf}<br />{brl(price)} por litro · {num(liters)} L</LTooltip>
                </CircleMarker>); })}
            </MapContainer>
          </div>
          <div className="flex flex-col gap-3 min-w-0">
            <div className="flex flex-wrap items-center gap-3"><Tabs value={reg} onChange={setReg} tabs={[{ key: 'uf', label: 'Estado' }, { key: 'cidade', label: 'Cidade' }, { key: 'bairro', label: 'Bairro' }]} /></div>
            <p className="text-caption text-ink-2">Círculo maior = mais litros. Cor do azul (mais barato) ao rosa (mais caro).</p>
            <Table minWidth={420} dense align={['left', 'right', 'right', 'right']} head={['Região', 'R$/L', 'Litros', 'km/L']} rows={byReg.map((r) => [<span className="text-small">{r.k}</span>, <Num value={r.price} digits={2} size="body" />, <Num value={r.liters} size="body" />, r.kml ? <Num value={r.kml} digits={2} size="body" /> : '—'])} />
          </div>
        </Grid>
      </ChartCard>
      <Card title="Desempenho por veículo" icon="combustivel">
        <Table minWidth={860} align={['left', 'left', 'right', 'right', 'right', 'right', 'left', ...(B ? ['right' as const] : [])]} head={['Veículo', 'Modelo', 'Km rodado', 'Litros', 'Gasto (R$)', 'km/L', 'Meta', ...(B ? ['Variação do km/L'] : [])]} rows={A.perVeh.map((v) => { const vb = B?.perVeh.find((x) => x.id === v.id); return [<AssetName name={v.name} />, v.model, <Num value={v.km} size="body" />, <Num value={v.liters} size="body" />, <Num value={v.total} digits={2} size="body" />, v.kml ? <Num value={v.kml} digits={2} size="body" /> : '—', v.goal ? <span className="num">{num(v.goal.kml, 1)} <span className="text-ink-2">({v.goal.from})</span></span> : '—', ...(B ? [v.kml && vb?.kml ? <DeltaChip value={rel(v.kml, vb.kml)} unit="%" digits={1} good="up" size="sm" /> : '—'] : [])]; })} />
      </Card>
    </Stack>
  );
}

// ---------------------------------------------------------------- metas
// metas de consumo por frota, tipo de operação e veículo; teto mensal indicativo (alerta, não bloqueia)
function Metas() {
  const s = useStoreData();
  const goals = s.fuelGoals || { company: { kml: 5, budget: 80000 }, operations: {}, groups: {} };
  const set = (g: any) => s.patch(() => ({ fuelGoals: g }));
  const [saved, setSavedAt] = useState(0);
  useEffect(() => { if (saved) { const t = setTimeout(() => toast('Metas salvas.'), 600); return () => clearTimeout(t); } }, [saved]);
  const touch = () => setSavedAt(Date.now());
  const fleetSpend = monthSpend(s, () => true);
  const vehs = opAssets(s).filter((a: any) => a.kind === 'veiculo');
  const Budget = ({ spent, cap }: { spent: number; cap?: number }) => !cap ? <span className="text-ink-2 text-small">Sem teto</span> : (
    <div className="flex items-center gap-2 min-w-[180px]"><Progress className="h-2 flex-1" value={Math.min(1, spent / cap)} color={spent > cap ? 'var(--loss)' : 'var(--real)'} label={`${brl(spent)} de ${brl(cap)}`} /><span className={cx('text-caption num whitespace-nowrap', spent > cap && 'text-loss-ink font-medium')}>{pct(spent / cap, 0)}</span></div>
  );
  return (
    <Stack gap="grid">
      <p className="text-small text-ink-2 max-w-[90ch]">A meta de consumo vale na ordem: veículo, tipo de operação, grupo e empresa. O teto mensal é indicativo: quem passa dele aparece em alerta, mas o lançamento não é bloqueado.</p>
      <Card title="Frota" icon="ativos">
        <div className="grid sm:grid-cols-[repeat(2,minmax(0,12rem))_1fr] gap-field items-end">
          <Field label="Meta de consumo (km/L)"><Input type="number" step="0.1" value={goals.company?.kml || ''} onChange={(e) => { set({ ...goals, company: { ...goals.company, kml: +e.target.value } }); touch(); }} /></Field>
          <Field label="Teto mensal (R$)"><Input type="number" value={goals.company?.budget || ''} onChange={(e) => { set({ ...goals, company: { ...goals.company, budget: +e.target.value } }); touch(); }} /></Field>
          <div><p className="text-caption text-ink-2 mb-tight">Gasto no mês: <span className="num">{brl(fleetSpend)}</span></p><Budget spent={fleetSpend} cap={goals.company?.budget} /></div>
        </div>
      </Card>
      <Grid cols={2} wide equal>
        <Card title="Por tipo de operação">
          <Table minWidth={420} align={['left', 'right', 'left']} head={['Operação', 'Veículos', 'Meta (km/L)']} rows={s.operations.map((o: any) => [<span className="font-medium">{o.name}</span>, <span className="num">{vehs.filter((a: any) => a.operationId === o.id).length}</span>, <Input className="w-28" type="number" step="0.1" aria-label={`Meta ${o.name}`} value={goals.operations?.[o.id] || ''} onChange={(e) => { set({ ...goals, operations: { ...goals.operations, [o.id]: +e.target.value } }); touch(); }} />])} />
        </Card>
        <Card title="Por grupo">
          <Table minWidth={420} align={['left', 'right', 'left']} head={['Grupo', 'Veículos', 'Meta (km/L)']} rows={s.groups.map((g: any) => [<span className="font-medium">{g.name}</span>, <span className="num">{vehs.filter((a: any) => a.groupIds.includes(g.id)).length}</span>, <Input className="w-28" type="number" step="0.1" aria-label={`Meta ${g.name}`} value={goals.groups?.[g.id] || ''} onChange={(e) => { set({ ...goals, groups: { ...goals.groups, [g.id]: +e.target.value } }); touch(); }} />])} />
        </Card>
      </Grid>
      <Card title="Por veículo">
        <Table minWidth={860} head={['Veículo', 'Operação', 'Meta própria (km/L)', 'Meta que vale', 'Teto mensal (R$)', 'Gasto no mês']} rows={vehs.map((a: any) => { const g = goalFor(s, a); const sp = monthSpend(s, (f) => f.assetId === a.id); return [
          <AssetName name={a.name} />, s.operations.find((o: any) => o.id === a.operationId)?.name || '—',
          <Input className="w-24" type="number" step="0.1" aria-label={`Meta ${a.name}`} value={a.fuelGoal || ''} placeholder="herda" onChange={(e) => { s.upsert('assets', { id: a.id, fuelGoal: +e.target.value }); touch(); }} />,
          <span className="text-small num">{g ? `${num(g.kml, 1)} km/L · ${g.from}` : '—'}</span>,
          <Input className="w-28" type="number" aria-label={`Teto ${a.name}`} value={a.fuelBudget || ''} onChange={(e) => { s.upsert('assets', { id: a.id, fuelBudget: +e.target.value }); touch(); }} />,
          <Budget spent={sp} cap={a.fuelBudget} />]; })} />
      </Card>
    </Stack>
  );
}
