import { opAssets, hadTracker } from '@localle/shared/assetStatus';
import { RetiredToggle } from '../components/RetiredToggle';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { useSearchParams } from 'react-router-dom';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Check, TextButton, Slider, Tabs, EmptyState, ErrorState, Spinner, DescList, DescRow, Stack, Grid, cx, toast } from '../components/ui';
import { KpiTile, Num, StatusDot, numSizeClass } from '../components/story';
import { Icon } from '../components/icons';
import { MonitorHeader } from '../components/MonitorTabs';
import { ExportReportModal, type ExportFormat } from '../components/ExportReportModal';
import { csv, xlsx, pdf, pdfFileName } from '../lib/reportExport';
import { cachedAddress, resolveAddresses } from '../lib/geocode';
import { categoryOf } from '../components/assetArt';
import { GlideMarker, bearing, FenceShapes, Address, TILE, ATTR } from '../components/MapBits';
import { tv } from '../lib/tokens';
import { EVENT_TYPES } from '@localle/shared/catalog';
import { fetchRoute } from '../lib/rastreioApi';
import { routeStats } from '@localle/shared/routeStats';
import { matchToRoads } from '@localle/shared/routeMatch';
import { fmtDT, fmtD, fmtT, haversine, num, toInputDT, HOUR, hm } from '@localle/shared/utils';

function Fit({ pts, follow, cur }: any) { const m = useMap(); useEffect(() => { if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40] }); }, [pts.length && pts[0][0], pts.length]); useEffect(() => { if (follow && cur) m.panTo(cur, { animate: true }); }, [follow, cur?.[0], cur?.[1]]); return null; }

export default function Replay() {
  const [sp] = useSearchParams();
  // com "Incluir inativos", vendidos/baixados que tiveram rastreador aparecem para rever o percurso antigo
  // estado sem os passos do simulador: o percurso só é lido ao carregar, não precisa redesenhar a cada 2 s
  const sd = useStoreData(60000);
  const assets = useMemo(() => opAssets(sd).filter((a: any) => hadTracker(sd, a)), [sd.assets, sd.accessLog, sd.includeRetired]);
  const history = sd.history;
  const allEvents = useStore((s) => s.events);
  const fences = useStore((s) => s.fences);
  const revenda = useStore((s) => s.revenda);
  const session = useStore((s) => s.session);
  const [aid, setAid] = useState(sp.get('a') || 'a1');
  const [from, setFrom] = useState(toInputDT(Date.now() - 8 * HOUR));
  const [to, setTo] = useState(toInputDT(Date.now()));
  const [loaded, setLoaded] = useState({ aid, from, to, n: 0 });
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mult, setMult] = useState(4);
  const [follow, setFollow] = useState(true);
  const [showEv, setShowEv] = useState(true);
  const [showF, setShowF] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const asset = assets.find((a: any) => a.id === loaded.aid);

  // veículo real: percurso vem da API; simulado: do histórico local
  const [remote, setRemote] = useState<{ pts: any[]; loading: boolean; error: string } | null>(null);
  useEffect(() => {
    if (!asset?.tracker?.live) { setRemote(null); return; }
    let alive = true;
    setRemote({ pts: [], loading: true, error: '' });
    fetchRoute(asset.tracker.imei, new Date(loaded.from).getTime(), new Date(loaded.to).getTime())
      .then((p) => alive && setRemote({ pts: p, loading: false, error: '' }))
      .catch((e) => alive && setRemote({ pts: [], loading: false, error: e.message }));
    return () => { alive = false; };
  }, [loaded, asset?.tracker?.imei]);
  const pts = useMemo(() => {
    if (remote) return remote.pts;
    const f = new Date(loaded.from).getTime(), t = new Date(loaded.to).getTime();
    return (history[loaded.aid] || []).filter((p: any) => p[0] >= f && p[0] <= t);
  }, [loaded, remote]);
  const evs = useMemo(() => {
    const f = new Date(loaded.from).getTime(), t = new Date(loaded.to).getTime();
    return allEvents.filter((e: any) => e.assetId === loaded.aid && e.ts >= f && e.ts <= t);
  }, [loaded, allEvents.length]);
  const stats = useMemo(() => routeStats(pts), [pts]);

  // Ajusta o traçado desenhado às ruas (OSM/OSRM); sem internet ou com o serviço fora, cai na posição bruta do
  // rastreador — não trava o replay. Só a linha e o marcador mudam; estatísticas seguem a posição real do GPS.
  const [matched, setMatched] = useState<([number, number] | null)[] | null>(null);
  const [matching, setMatching] = useState(false);
  useEffect(() => {
    let alive = true;
    setMatched(null);
    if (pts.length < 2) return;
    setMatching(true);
    matchToRoads(pts as any).then((m) => { if (alive) { setMatched(m); setMatching(false); } });
    return () => { alive = false; };
  }, [pts]);
  const snap = (i: number, p: any): [number, number] => matched?.[i] ?? [p[1], p[2]];

  const timer = useRef<any>();
  useEffect(() => {
    clearInterval(timer.current);
    if (playing) timer.current = setInterval(() => setIdx((i) => { if (i + 1 >= pts.length) { setPlaying(false); return i; } return Math.min(pts.length - 1, i + mult); }), 120);
    return () => clearInterval(timer.current);
  }, [playing, mult, pts.length]);
  useEffect(() => { setIdx(0); setPlaying(false); }, [loaded]);

  const cur = pts[idx];
  const line = pts.map((p: any, i: number) => snap(i, p));
  const done = line.slice(0, idx + 1);
  const curEvt = cur && evs.find((e: any) => Math.abs(e.ts - cur[0]) < 90000);
  const inside = cur ? fences.filter((f: any) => (f.shape === 'circle' ? haversine([cur[1], cur[2]], f.center) <= f.radius : false)).map((f: any) => f.name) : [];

  return (
    <div>
      <MonitorHeader title="Replay de percurso" subtitle="Reveja o trajeto, as paradas e os eventos de um veículo."><RetiredToggle /></MonitorHeader>
      <Stack gap="grid">
      <Card>
        <div className="flex flex-wrap gap-field items-end">
          <Field label="Veículo"><SearchSelect className="w-56" value={aid} onChange={setAid} options={assets.map((a: any) => ({ value: a.id, label: a.name, sub: a.model }))} /></Field>
          <Field label="De"><Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Até"><Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button variant="dark" loading={!!remote?.loading} onClick={() => setLoaded({ aid, from, to, n: loaded.n + 1 })}>Carregar percurso</Button>
          <Button variant="primary" disabled={!pts.length} onClick={() => setExportOpen(true)}><Icon name="play" size={16} />Gerar relatório</Button>
          <span className="text-caption text-ink-2">A simulação guarda as últimas ~2.000 posições por veículo.</span>
          {matching && <span className="text-caption text-ink-2 inline-flex items-center gap-tight"><Spinner size={14} />Ajustando o traçado às ruas…</span>}
        </div>
      </Card>
      <Grid cols={5} equal>
        <KpiTile label="Distância" value={stats.dist} digits={1} unit="km" />
        <KpiTile label="Tempo em movimento" display={<span className={cx(numSizeClass('kpi'), 'num')}>{hm(stats.moving)}</span>} />
        <KpiTile label="Paradas (> 5 min)" value={stats.stops.length} />
        <KpiTile label="Velocidade máxima" value={stats.vmax} unit="km/h" status={stats.vmax > 80 ? 'parado' : undefined} sub={stats.vmax > 80 ? 'Acima de 80 km/h' : undefined} />
        <KpiTile label="Eventos" value={evs.length} />
      </Grid>
      <div className="flex flex-wrap items-start gap-grid">
        <section className="flex-[999_1_560px] min-w-0 h-[560px] rounded-card overflow-hidden border border-line relative">
          <MapContainer center={[-8.1, -34.92]} zoom={12} className="w-full h-full">
            <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
            {showF && <FenceShapes fences={fences} />}
            <Polyline positions={line} pathOptions={{ color: tv('--route'), weight: 4, opacity: 0.7 }} />
            <Polyline positions={done} pathOptions={{ color: tv('--real'), weight: 5 }} />
            {showEv && evs.map((e: any) => <CircleMarker key={e.id} center={e.pos} radius={7} pathOptions={{ color: tv('--card'), fillColor: tv('--loss'), fillOpacity: 1, weight: 2 }}><Tooltip>{EVENT_TYPES[e.type]?.label} · {e.value} km/h · {fmtT(e.ts)}</Tooltip></CircleMarker>)}
            {stats.stops.map((s: any, i: number) => <CircleMarker key={i} center={s.pos} radius={8} pathOptions={{ color: tv('--card'), fillColor: tv('--status-parado'), fillOpacity: 1, weight: 2 }}><Tooltip>Parada {fmtT(s.ts)}–{fmtT(s.end)}</Tooltip></CircleMarker>)}
            {cur && <GlideMarker key={asset?.id} category={categoryOf(asset)} position={snap(idx, cur)} plate={asset?.name || ''} note={`${cur[3]} km/h`} kind={cur[3] > 3 ? 'mov' : cur[4] ? 'parado' : 'off'} heading={idx > 0 ? bearing([pts[idx - 1][1], pts[idx - 1][2]], [cur[1], cur[2]]) : 0} selected />}
            <Fit pts={line} follow={follow && playing} cur={cur ? snap(idx, cur) : null} />
          </MapContainer>
          {pts.length === 0 && <div className="absolute inset-0 z-[400] flex items-center justify-center bg-[color-mix(in_srgb,var(--card)_80%,transparent)] p-4">
            <div className="bg-card border border-line rounded-panel shadow-panel max-w-[520px] w-full">
              {remote?.loading ? <p role="status" className="flex items-center justify-center gap-icon py-8 text-body text-ink-2"><Spinner />Buscando percurso no rastreador…</p>
                : remote?.error ? <ErrorState illustration="ilu-erro" layout="row" title="Não foi possível buscar o percurso" detail={remote.error} onRetry={() => setLoaded({ ...loaded, n: loaded.n + 1 })} />
                : <EmptyState illustration="ilu-replay" layout="row" title="Sem posições no período escolhido" detail="Escolha outro período ou outro veículo e carregue o percurso." />}
            </div>
          </div>}
        </section>
        <aside className="flex-[1_1_300px] max-w-[380px] flex flex-col gap-grid">
          <Card title="Ponto atual" icon="rota">
            {cur ? <>
              <DescList>
                <DescRow label="Hora"><span className="font-medium">{fmtDT(cur[0])}</span></DescRow>
                <DescRow label="Velocidade"><Num value={cur[3]} unit="km/h" size="body" className="font-medium" /></DescRow>
                <DescRow label="Ignição"><StatusDot kind={cur[3] > 3 ? 'mov' : cur[4] ? 'parado' : 'off'} label={cur[4] ? 'Ligada' : 'Desligada'} /></DescRow>
                <DescRow label="Endereço"><Address pos={playing ? null : [cur[1], cur[2]]} className="font-medium" /></DescRow>
                <DescRow label="Coordenadas"><span className="font-mono text-small">{cur[1].toFixed(5)}, {cur[2].toFixed(5)}</span></DescRow>
                <DescRow label="Cerca">{inside.join(', ') || '—'}</DescRow>
              </DescList>
              {curEvt && <p className="mt-stack"><StatusDot kind="parado" label={`${EVENT_TYPES[curEvt.type]?.label} (${curEvt.value} km/h)`} /></p>}
            </> : <EmptyState icon="rota" title="Carregue um percurso" detail="Escolha o veículo e o período acima." />}
          </Card>
        </aside>
      </div>
      <Card className="no-print"
        title="Replay do percurso"
        subtitle={pts.length ? `${asset?.name || '—'} · ${fmtD(pts[0][0])} · ${fmtT(pts[0][0])}–${fmtT(pts[pts.length - 1][0])}` : (asset?.name || '—')}
        actions={<Num value={pts.length ? Math.round((idx / Math.max(1, pts.length - 1)) * 100) : 0} unit="%" size="lg" />}>
        <div className="flex flex-wrap gap-tight items-center">
          <Button className="min-w-[132px]" onClick={() => { if (idx >= pts.length - 1) setIdx(0); setPlaying(!playing); }} disabled={!pts.length}><Icon name={playing ? 'pause' : 'play'} size={18} />{playing ? 'Pausar' : 'Reproduzir'}</Button>
          <Button variant="quiet" disabled={!pts.length} onClick={() => { setPlaying(false); setIdx(0); }}><Icon name="reiniciar" size={18} />Reiniciar</Button>
          <Button variant="quiet" disabled={!pts.length} onClick={() => setIdx(Math.max(0, idx - 20))}><Icon name="voltar" size={18} />Anterior</Button>
          <Button variant="quiet" disabled={!pts.length} onClick={() => setIdx(Math.min(pts.length - 1, idx + 20))}>Próximo<Icon name="chevron" size={18} /></Button>
          <span className="w-px self-stretch bg-line mx-tight" aria-hidden="true" />
          <span className="text-small font-medium text-ink-2">Velocidade</span>
          <Tabs size="sm" value={String(mult)} onChange={(k) => setMult(+k)} tabs={[1, 4, 10, 25].map((m) => ({ key: String(m), label: `${m}x` }))} />
          {pts.length > 0 && cur && <span className="ml-auto num text-small text-ink-2">{fmtT(cur[0])} de {fmtT(pts[pts.length - 1][0])}</span>}
        </div>
        <Slider aria-label="Posição no percurso" min={0} max={Math.max(0, pts.length - 1)} value={idx} onChange={(e) => setIdx(+e.target.value)} className="mt-card-head" />
        {pts.length > 1 && <div className="flex justify-between mt-hair text-caption text-ink-3 num">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{fmtT(pts[Math.round(f * (pts.length - 1))][0])}</span>)}
        </div>}
        <div className="flex flex-wrap items-center gap-x-grid gap-y-stack mt-stack">
          <Check label="Seguir veículo" checked={follow} onChange={setFollow} /><Check label="Mostrar eventos" checked={showEv} onChange={setShowEv} /><Check label="Mostrar cercas" checked={showF} onChange={setShowF} />
          <span className="ml-auto text-caption text-ink-3">Arraste o marcador para navegar pelo percurso</span>
        </div>
      </Card>
      <Card title="Eventos e paradas do percurso" icon="historico">
        <Table emptyState={<EmptyState icon="ok" title="Nenhum evento ou parada neste percurso" />} head={['Hora', 'Ocorrência', 'Detalhe', 'Endereço', '']} rows={[...evs.map((e: any) => ({ ts: e.ts, t: EVENT_TYPES[e.type]?.label, d: e.value + ' km/h', pos: e.pos })), ...stats.stops.map((s: any) => ({ ts: s.ts, t: 'Parada', d: hm(s.end - s.ts), pos: s.pos }))].sort((a, b) => a.ts - b.ts).map((r) => [<span className="num">{fmtDT(r.ts)}</span>, <span className="font-medium">{r.t}</span>, <span className="num">{r.d}</span>, <Address pos={r.pos} className="text-small" />, <TextButton onClick={() => { const i = pts.findIndex((p: any) => p[0] >= r.ts); if (i >= 0) { setIdx(i); setPlaying(false); } }}>Ir para o ponto</TextButton>])} />
      </Card>
      </Stack>

      <ExportReportModal open={exportOpen} onClose={() => setExportOpen(false)} titulo="Replay de percurso"
        periodo={pts.length ? `${fmtD(pts[0][0])} · ${fmtT(pts[0][0])}–${fmtT(pts[pts.length - 1][0])}` : '—'}
        resumo={`${asset?.name || '—'} · ${pts.length} posições`}
        itens={['Percurso detalhado do período', 'Eventos e paradas', 'Resumo de distância e velocidade', 'Cabeçalho com nome da empresa e data de emissão']}
        onExport={async (formato: ExportFormat) => {
          if (!pts.length) return toast('Nada para exportar neste período.', { tone: 'crit' });
          const periodoLabel = `${fmtDT(pts[0][0])} → ${fmtDT(pts[pts.length - 1][0])}`;
          const nomeArq = (ext: string) => `replay-${asset?.plate || asset?.id || 'veiculo'}-${new Date(pts[0][0]).toISOString().slice(0, 10)}.${ext}`;
          // posições: endereço só o que a tela já resolveu (cache), sem travar a exportação num histórico grande
          const head = ['Data/hora', 'Velocidade (km/h)', 'Ignição', 'Endereço', 'Latitude', 'Longitude'];
          const rows = pts.map((p: any) => [fmtDT(p[0]), Math.round(p[3]), p[4] ? 'Ligada' : 'Desligada', cachedAddress(p[1], p[2]), p[1], p[2]]);
          // eventos e paradas: lista curta, busca o endereço de verdade (com cache) para cada um
          const evPontos = [...evs.map((e: any) => e.pos as [number, number]), ...stats.stops.map((s: any) => s.pos as [number, number])];
          const evEnderecos = await resolveAddresses(evPontos);
          const evHead = ['Hora', 'Ocorrência', 'Detalhe', 'Endereço'];
          const evRows = [...evs.map((e: any, i: number) => [fmtDT(e.ts), EVENT_TYPES[e.type]?.label, `${e.value} km/h`, evEnderecos[i]]),
            ...stats.stops.map((s: any, i: number) => [fmtDT(s.ts), 'Parada', hm(s.end - s.ts), evEnderecos[evs.length + i]])].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
          const meta = { empresa: `${revenda.clientName} — Replay de percurso`, periodo: `Período: ${periodoLabel}`, filtros: `Veículo: ${asset?.name || '—'}`, emitidoEm: fmtDT(Date.now()) };
          if (formato === 'csv') csv(nomeArq('csv'), head, rows);
          else if (formato === 'xlsx') xlsx(nomeArq('xlsx'), meta, head, rows);
          else pdf({
            file: pdfFileName('Replay_de_Percurso', pts[0][0], pts[pts.length - 1][0], asset?.plate),
            titulo: 'Relatório de Replay de Percurso', cliente: revenda.clientName, usuario: session?.name || '—', role: session?.role || '—',
            meta: [
              { label: 'Período', value: periodoLabel },
              { label: 'Veículo', value: asset?.name || '—' },
              { label: 'Distância', value: `${Math.round(stats.dist)} km` },
              { label: 'Velocidade máxima', value: `${Math.round(stats.vmax)} km/h` },
            ],
            sections: [
              { title: 'Percurso', head, rows },
              { title: 'Eventos e paradas', head: evHead, rows: evRows },
            ],
            nota: 'Cada linha é uma posição enviada pelo rastreador, em ordem cronológica.',
          });
          toast(`Relatório de replay gerado com ${rows.length} ${rows.length === 1 ? 'posição' : 'posições'}.`);
        }} />
    </div>
  );
}
