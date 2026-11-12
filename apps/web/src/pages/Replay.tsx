import { opAssets, hadTracker } from '@localle/shared/assetStatus';
import { RetiredToggle } from '../components/RetiredToggle';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAlturaLivre } from '../lib/alturaLivre';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { useSearchParams } from 'react-router-dom';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, SearchSelect, Check, Slider, Tabs, EmptyState, ErrorState, Spinner, DescList, DescRow, Stack, IconButton, cx, toast, useIsMobile, useEdgeFade } from '../components/ui';
import { KpiTile, Num, StatusDot, numSizeClass } from '../components/story';
import { Icon } from '../components/icons';
import { MonitorHeader } from '../components/MonitorTabs';
import { ExportReportModal, type ExportFormat } from '../components/ExportReportModal';
import { csv, xlsx, pdf, pdfFileName, fmtCoord } from '../lib/reportExport';
import { cachedAddress, resolveAddresses } from '../lib/geocode';
import { categoryOf } from '../components/assetArt';
import { GlideMarker, bearing, FenceShapes, Address, TILE, ATTR } from '../components/MapBits';
import { tv } from '../lib/tokens';
import { EVENT_TYPES } from '@localle/shared/catalog';
import { fetchLiveRoute } from '../lib/positionsSource';
import { fetchEventos } from '../lib/localleApi';
import { routeStats } from '@localle/shared/routeStats';
import { matchToRoads } from '@localle/shared/routeMatch';
import { fmtDT, fmtD, fmtT, haversine, num, toInputDT, HOUR, hm } from '@localle/shared/utils';
import { rotuloIgnicao } from '../lib/relatorioPosicoes';

// o mapa nasce com a altura padrão e depois ganha a da janela (alturaLivre): sem invalidateSize o Leaflet não carrega os
// blocos da área nova e fica uma faixa cinza no pé
function Fit({ pts, follow, cur }: any) { const m = useMap(); useEffect(() => { const ro = new ResizeObserver(() => m.invalidateSize({ pan: false })); ro.observe(m.getContainer()); return () => ro.disconnect(); }, [m]); useEffect(() => { if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40] }); }, [pts.length && pts[0][0], pts.length]); useEffect(() => { if (follow && cur) m.panTo(cur, { animate: true }); }, [follow, cur?.[0], cur?.[1]]); return null; }

export default function Replay() {
  const [sp] = useSearchParams();
  // o mapa cabe na janela ao lado do "Ponto atual" (lib/alturaLivre); a tabela de eventos fica abaixo, rolando
  const linhaRef = useRef<HTMLDivElement>(null);
  // piso menor que o padrão (360): com o piso, numa janela baixa o mapa passava do fim da tela e a barra de reprodução,
  // no pé do mapa, ficava fora de vista — esta tela não rola no desktop
  const livre = useAlturaLivre(linhaRef, { min: 260 });
  // com "Incluir inativos", vendidos/baixados que tiveram rastreador aparecem para rever o percurso antigo
  // estado sem as chaves ao vivo: o percurso só é lido ao carregar, não precisa redesenhar a cada 2 s
  const sd = useStoreData(60000);
  const assets = useMemo(() => opAssets(sd).filter((a: any) => hadTracker(sd, a)), [sd.assets, sd.accessLog, sd.includeRetired]);
  const history = sd.history;
  const allEvents = useStore((s) => s.events);
  const fences = useStore((s) => s.fences);
  const revenda = useStore((s) => s.revenda);
  const session = useStore((s) => s.session);
  // veículo da URL (?a=, vindo do mapa) ou o primeiro da frota quando ela chegar; antes abria num id de demonstração ('a1')
  const [aid, setAid] = useState(sp.get('a') || '');
  const [from, setFrom] = useState(toInputDT(Date.now() - 8 * HOUR));
  const [to, setTo] = useState(toInputDT(Date.now()));
  const [loaded, setLoaded] = useState({ aid, from, to, n: 0 });
  useEffect(() => { if (!aid && assets[0]) { setAid(assets[0].id); setLoaded((l) => ({ ...l, aid: assets[0].id })); } }, [assets]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mult, setMult] = useState(4);
  const [follow, setFollow] = useState(true);
  const [showEv, setShowEv] = useState(true);
  const [showF, setShowF] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const mobile = useIsMobile();
  const faixa = useRef<HTMLDivElement>(null);
  useEdgeFade(faixa);
  const asset = assets.find((a: any) => a.id === loaded.aid);

  // veículo real: percurso vem da API; demais: do histórico local
  const [remote, setRemote] = useState<{ pts: any[]; loading: boolean; error: string } | null>(null);
  useEffect(() => {
    if (!asset?.tracker?.live) { setRemote(null); return; }
    let alive = true;
    setRemote({ pts: [], loading: true, error: '' });
    fetchLiveRoute(asset, new Date(loaded.from).getTime(), new Date(loaded.to).getTime())
      .then((p) => alive && setRemote({ pts: p, loading: false, error: '' }))
      .catch((e) => alive && setRemote({ pts: [], loading: false, error: e.message }));
    return () => { alive = false; };
  }, [loaded, asset?.id, asset?.tracker?.imei]);
  const pts = useMemo(() => {
    if (remote) return remote.pts;
    const f = new Date(loaded.from).getTime(), t = new Date(loaded.to).getTime();
    return (history[loaded.aid] || []).filter((p: any) => p[0] >= f && p[0] <= t);
  }, [loaded, remote]);
  // veículo real: eventos do período vêm do backend (alarmes, cercas, regras); demais: do store
  const [evsReais, setEvsReais] = useState<any[] | null>(null);
  useEffect(() => {
    if (!asset?.tracker?.live || asset?.tracker?.source !== 'localle') { setEvsReais(null); return; }
    let vivo = true;
    fetchEventos(asset.id, new Date(loaded.from).getTime(), new Date(loaded.to).getTime())
      .then((e) => vivo && setEvsReais(e))
      .catch(() => vivo && setEvsReais([]));
    return () => { vivo = false; };
  }, [loaded, asset?.id]);
  const evs = useMemo(() => {
    if (evsReais) return evsReais;
    const f = new Date(loaded.from).getTime(), t = new Date(loaded.to).getTime();
    return allEvents.filter((e: any) => e.assetId === loaded.aid && e.ts >= f && e.ts <= t);
  }, [loaded, allEvents.length, evsReais]);
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
  // eventos e paradas em ordem de hora, para a lista ao lado do mapa (clicar leva o replay até o ponto)
  const ocorrencias = useMemo(() => [...evs.map((e: any) => ({ ts: e.ts, t: (EVENT_TYPES[e.type]?.label ?? e.label) as string, d: e.value == null ? '' : `${e.value} km/h` })),
    ...stats.stops.map((s: any) => ({ ts: s.ts, t: 'Parada', d: hm(s.end - s.ts) }))].sort((a, b) => a.ts - b.ts), [evs, stats]);
  const inside = cur ? fences.filter((f: any) => (f.shape === 'circle' ? haversine([cur[1], cur[2]], f.center) <= f.radius : false)).map((f: any) => f.name) : [];

  return (
    <div>
      <MonitorHeader title="Replay de percurso" subtitle="Reveja o trajeto, as paradas e os eventos de um veículo."><RetiredToggle /></MonitorHeader>
      <Stack gap="grid">
      {/* filtros e indicadores do percurso no mesmo card (design de 12/11): numa linha só em tela larga, quebram abaixo
          quando não cabem */}
      <Card>
        <div className="flex flex-wrap items-center gap-grid">
          <div className="flex flex-wrap gap-field items-end flex-[1_1_auto] max-md:[&>*]:w-full">
            <Field label="Veículo"><SearchSelect className="w-56 max-md:w-full" value={aid} onChange={setAid} options={assets.map((a: any) => ({ value: a.id, label: a.name, sub: a.model }))} /></Field>
            <Field label="De"><Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Até"><Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Button variant="dark" loading={!!remote?.loading} onClick={() => setLoaded({ aid, from, to, n: loaded.n + 1 })}>Carregar percurso</Button>
            <Button variant="primary" disabled={!pts.length} onClick={() => setExportOpen(true)}><Icon name="play" size={16} />Gerar relatório</Button>
            {matching && <span className="text-caption text-ink-2 inline-flex items-center gap-tight self-center"><Spinner size={14} />Ajustando o traçado às ruas…</span>}
          </div>
          {/* celular: faixa que rola de lado — precisa de foco pelo teclado para rolar e de nome para o leitor de tela */}
          <div ref={faixa} role={mobile ? 'region' : undefined} aria-label={mobile ? 'Indicadores do percurso' : undefined} tabIndex={mobile ? 0 : undefined}
            className="grid grid-cols-5 gap-tight flex-[1_1_600px] min-w-0 max-md:flex max-md:overflow-x-auto max-md:overscroll-x-contain max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden max-md:[&>*]:w-[132px] max-md:[&>*]:shrink-0">
            <KpiTile variant="inset" label="Distância" value={stats.dist} digits={1} unit="km" />
            <KpiTile variant="inset" label="Tempo em movimento" display={<span className={cx(numSizeClass('lg'), 'num')}>{hm(stats.moving)}</span>} />
            <KpiTile variant="inset" label="Paradas (> 5 min)" value={stats.stops.length} />
            <KpiTile variant="inset" label="Velocidade máxima" value={stats.vmax} unit="km/h" status={stats.vmax > 80 ? 'parado' : undefined} sub={stats.vmax > 80 ? 'Acima de 80 km/h' : undefined} />
            <KpiTile variant="inset" label="Eventos" value={evs.length} />
          </div>
        </div>
      </Card>
      {/* celular: a linha mapa + "Ponto atual" se desfaz (contents) para os controles de reprodução ficarem logo abaixo do
          mapa; "Ponto atual" desce (order) */}
      <div ref={linhaRef} style={livre ? { ['--livre' as string]: `${livre}px` } : undefined} className="flex flex-wrap items-stretch gap-grid max-md:contents">
        <section className="flex-[999_1_560px] max-md:flex-none min-w-0 h-[60vh] min-h-[340px] md:min-h-0 md:h-[var(--livre,560px)] rounded-card overflow-hidden border border-line relative">
          <MapContainer center={[-8.1, -34.92]} zoom={12} className="w-full h-full">
            <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
            {showF && <FenceShapes fences={fences} />}
            <Polyline positions={line} pathOptions={{ color: tv('--route'), weight: 4, opacity: 0.7 }} />
            <Polyline positions={done} pathOptions={{ color: tv('--real'), weight: 5 }} />
            {showEv && evs.map((e: any) => <CircleMarker key={e.id} center={e.pos} radius={7} pathOptions={{ color: tv('--card'), fillColor: tv('--loss'), fillOpacity: 1, weight: 2 }}><Tooltip>{(EVENT_TYPES[e.type]?.label ?? e.label)}{e.value == null ? "" : ` · ${e.value} km/h`} · {fmtT(e.ts)}</Tooltip></CircleMarker>)}
            {stats.stops.map((s: any, i: number) => <CircleMarker key={i} center={s.pos} radius={8} pathOptions={{ color: tv('--card'), fillColor: tv('--status-parado'), fillOpacity: 1, weight: 2 }}><Tooltip>Parada {fmtT(s.ts)}–{fmtT(s.end)}</Tooltip></CircleMarker>)}
            {cur && <GlideMarker key={asset?.id} category={categoryOf(asset)} position={snap(idx, cur)} plate={asset?.name || ''} note={`${cur[3]} km/h`} kind={cur[3] > 3 ? 'mov' : cur[4] ? 'parado' : 'off'} heading={idx > 0 ? bearing([pts[idx - 1][1], pts[idx - 1][2]], [cur[1], cur[2]]) : 0} selected />}
            <Fit pts={line} follow={follow && playing} cur={cur ? snap(idx, cur) : null} />
          </MapContainer>
          {/* controles de reprodução sobre o mapa (sprint 28/10/2026, melhoria 3): antes ficavam num card abaixo e era
              preciso rolar a tela para dar play. Acima da atribuição do mapa (bottom-6), que precisa ficar visível.
              Sempre à vista (12/11): sem percurso carregado, desabilitados */}
          {(
            <div role="group" aria-label="Reprodução do percurso" className="no-print absolute inset-x-3 bottom-6 z-[450] bg-card border border-line rounded-panel shadow-panel px-3 py-2 flex flex-col gap-hair">
              {/* celular: uma linha só — a velocidade vira um botão que alterna 1x → 4x → 10x → 25x e a hora mostra só o ponto atual */}
              <div className="flex items-center gap-tight">
                <Button size="sm" className="min-w-[112px] max-md:min-w-0" disabled={!pts.length} onClick={() => { if (idx >= pts.length - 1) setIdx(0); setPlaying(!playing); }}><Icon name={playing ? 'pause' : 'play'} size={16} /><span className="max-md:sr-only">{playing ? 'Pausar' : 'Reproduzir'}</span></Button>
                <IconButton size="sm" aria-label="Reiniciar" disabled={!pts.length} onClick={() => { setPlaying(false); setIdx(0); }}><Icon name="reiniciar" size={16} /></IconButton>
                <IconButton size="sm" aria-label="Voltar um trecho" disabled={!pts.length} onClick={() => setIdx(Math.max(0, idx - 20))}><Icon name="voltar" size={16} /></IconButton>
                <IconButton size="sm" aria-label="Avançar um trecho" disabled={!pts.length} onClick={() => setIdx(Math.min(pts.length - 1, idx + 20))}><Icon name="chevron" size={16} /></IconButton>
                <span className="ml-auto num text-small text-ink-2 whitespace-nowrap">{cur ? fmtT(cur[0]) : '--:--'}<span className="max-md:hidden"> de {cur ? fmtT(pts[pts.length - 1][0]) : '--:--'}</span></span>
                <button type="button" className="md:hidden shrink-0 h-ctl-sm min-w-11 px-3 rounded-pill bg-brand-fill text-brand-fill-ink text-caption font-semibold num"
                  aria-label={`Velocidade ${mult}x — tocar para trocar`} onClick={() => { const v = [1, 4, 10, 25]; setMult(v[(v.indexOf(mult) + 1) % v.length]); }}>{mult}x</button>
                <Tabs size="sm" className="max-md:hidden" value={String(mult)} onChange={(k) => setMult(+k)} tabs={[1, 4, 10, 25].map((m) => ({ key: String(m), label: `${m}x` }))} />
              </div>
              <Slider aria-label="Posição no percurso" disabled={!pts.length} min={0} max={Math.max(0, pts.length - 1)} value={idx} onChange={(e) => setIdx(+e.target.value)} />
            </div>
          )}
          {pts.length === 0 && <div className="absolute inset-0 z-[400] flex items-center max-md:items-start justify-center bg-[color-mix(in_srgb,var(--card)_80%,transparent)] p-4 max-md:p-3">
            <div className="bg-card border border-line rounded-panel shadow-panel max-w-[520px] w-full">
              {remote?.loading ? <p role="status" className="flex items-center justify-center gap-icon py-8 text-body text-ink-2"><Spinner />Buscando percurso no rastreador…</p>
                : remote?.error ? <ErrorState illustration={mobile ? undefined : 'ilu-erro'} layout="row" title="Não foi possível buscar o percurso" detail={remote.error} onRetry={() => setLoaded({ ...loaded, n: loaded.n + 1 })} />
                : <EmptyState icon="rota" illustration={mobile ? undefined : 'ilu-replay'} layout="row" title="Sem posições no período escolhido" detail="Escolha outro período ou outro veículo e carregue o percurso." />}
            </div>
          </div>}
        </section>
        {/* desktop: a tela não rola (design de 12/11) — a coluna tem a altura do mapa; a lista de ocorrências rola dentro
            dela e as opções de exibição ficam no pé */}
        <aside className="flex-[1_1_300px] max-w-[380px] max-md:flex-none max-md:max-w-none max-md:order-1 flex flex-col md:h-[var(--livre,560px)] min-h-0">
          <Card title="Ponto atual" icon="rota" className="flex-1 min-h-0">
            <div className="h-full flex flex-col min-h-0 md:overflow-y-auto">
              {cur ? <>
                <DescList>
                  <DescRow label="Hora"><span className="font-medium">{fmtDT(cur[0])}</span></DescRow>
                  <DescRow label="Velocidade"><Num value={cur[3]} unit="km/h" size="body" className="font-medium" /></DescRow>
                  <DescRow label="Ignição"><StatusDot kind={cur[3] > 3 ? 'mov' : cur[4] ? 'parado' : 'off'} label={rotuloIgnicao(cur[4])} /></DescRow>
                  <DescRow label="Endereço"><Address pos={playing ? null : [cur[1], cur[2]]} className="font-medium" /></DescRow>
                  <DescRow label="Coordenadas"><span className="font-mono text-small">{cur[1].toFixed(5)}, {cur[2].toFixed(5)}</span></DescRow>
                  <DescRow label="Cerca">{inside.join(', ') || '—'}</DescRow>
                </DescList>
                {curEvt && <p className="mt-stack"><StatusDot kind="parado" label={`${EVENT_TYPES[curEvt.type]?.label} (${curEvt.value} km/h)`} /></p>}
              </> : <EmptyState icon="rota" title="Carregue um percurso" detail="Escolha o veículo e o período acima." />}
              {ocorrencias.length > 0 && <div className="no-print mt-card-head flex flex-col min-h-[96px] flex-1">
                <h3 className="text-small font-semibold text-ink-2 mb-tight">Eventos e paradas <span className="num text-ink-3 font-normal">· {ocorrencias.length}</span></h3>
                <ul className="flex-1 min-h-0 overflow-y-auto -mx-2">
                  {ocorrencias.map((r, i) => <li key={i}>
                    <button type="button" onClick={() => { const j = pts.findIndex((p: any) => p[0] >= r.ts); if (j >= 0) { setIdx(j); setPlaying(false); } }}
                      className="w-full text-left px-2 py-1.5 rounded-btn hover:bg-card-2 flex items-baseline gap-tight text-small">
                      <span className="num text-ink-3 shrink-0">{fmtT(r.ts)}</span>
                      <span className="font-medium truncate">{r.t}</span>
                      <span className="num text-ink-2 ml-auto shrink-0">{r.d}</span>
                    </button>
                  </li>)}
                </ul>
              </div>}
              <div className="no-print mt-auto pt-stack flex flex-wrap items-center gap-x-grid gap-y-tight border-t border-line">
                <Check label="Seguir veículo" checked={follow} onChange={setFollow} /><Check label="Mostrar eventos" checked={showEv} onChange={setShowEv} /><Check label="Mostrar cercas" checked={showF} onChange={setShowF} />
              </div>
            </div>
          </Card>
        </aside>
      </div>
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
          const rows = pts.map((p: any) => [fmtDT(p[0]), Math.round(p[3]), rotuloIgnicao(p[4]), cachedAddress(p[1], p[2]), fmtCoord(p[1]), fmtCoord(p[2])]);
          // eventos e paradas: lista curta, busca o endereço de verdade (com cache) para cada um
          const evPontos = [...evs.map((e: any) => e.pos as [number, number]), ...stats.stops.map((s: any) => s.pos as [number, number])];
          const evEnderecos = await resolveAddresses(evPontos);
          const evHead = ['Hora', 'Ocorrência', 'Detalhe', 'Endereço'];
          const evRows = [...evs.map((e: any, i: number) => [fmtDT(e.ts), (EVENT_TYPES[e.type]?.label ?? e.label), (e.value == null ? "—" : `${e.value} km/h`), evEnderecos[i]]),
            ...stats.stops.map((s: any, i: number) => [fmtDT(s.ts), 'Parada', hm(s.end - s.ts), evEnderecos[evs.length + i]])].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
          const meta = { empresa: `${revenda.clientName} — Replay de percurso`, periodo: `Período: ${periodoLabel}`, filtros: `Veículo: ${asset?.name || '—'}`, emitidoEm: fmtDT(Date.now()) };
          if (formato === 'csv') csv(nomeArq('csv'), head, rows);
          else if (formato === 'xlsx') xlsx(nomeArq('xlsx'), meta, head, rows, [{ title: 'Eventos e paradas', head: evHead, rows: evRows }], 'Percurso');
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
