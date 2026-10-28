import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap, useMapEvents, Circle } from 'react-leaflet';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore, vehicleStatus, assetKm } from '../lib/store';
import { Button, Badge, usePresence, useScrollLock, toast, List, ListItem, DescList, DescRow, TextButton, Field, Input, SearchInput, Select, SearchSelect, Modal, Table, Textarea, Tabs, FilePick, Card, Panel, Callout, FloatingPanel, ContextMenu, ChoiceCard, EmptyState, ErrorState, buttonClass, PageBody, Stack, Grid, cx, AssetThumb } from '../components/ui';
import { MonitorHeader } from '../components/MonitorTabs';
import { glyphOf, silhouetteOf } from '../components/assetArt';
import { GlideMarker, ClusteredVehicles, Address, FenceShapes, MapButton, MapControls, VehicleListItem, MAP_STYLES, type MapStyleKey } from '../components/MapBits';
import { Num, Plate, AssetName, StatusDot, StatusLine, statusKind, STATUS_LABEL, KpiTile, Timeline, type StatusKind } from '../components/story';
import { StackedColumns } from '../components/charts';
import { Icon } from '../components/icons';
import { tv } from '../lib/tokens';
import { useCriticalMap, resolveReasons, recentTreatments, type CritReason } from '../lib/critical';
import { BATTERY_LOW_V } from '@localle/shared/engine';
import { TreatDialog, TreatedLine } from '../components/TreatDialog';
import { confirmarSenha, criarLink, enviarComandoLocalle, isRealAsset, lerParametro, listarLinks, revogarLink } from '../lib/localleApi';
import { lerVisao, salvarVisao, type VisaoMonitor } from '../lib/monitorPrefs';
import { SHARE_DURATIONS, shareUrl, shareState, createShare, revokeShare, useShareOpens } from '../lib/shares';
import { fmtDT, fmtT, haversine, num, toInputDT, shortDT, DAY } from '@localle/shared/utils';
import { sendRealCommand } from '../lib/rastreioApi';
import { rectUi } from '../lib/uiZoom';
import { veSintaxeComando } from '../lib/support';

// Lista ao vivo em lotes: com 600–2.000 veículos, montar todas as linhas de uma vez trava a rolagem. Mostra 80
// e acrescenta mais 80 quando o fim da lista aparece (IntersectionObserver), sem biblioteca de virtualização.
const BATCH = 80;
function MoreOnScroll({ onMore }: { onMore: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(([e]) => e.isIntersecting && onMore(), { rootMargin: '200px' }); io.observe(el); return () => io.disconnect(); }, [onMore]);
  return <li ref={ref} aria-hidden="true" className="h-px" />;
}

function FlyTo({ pos }: { pos?: [number, number] }) { const m = useMap(); useEffect(() => { if (pos) m.flyTo(pos, Math.max(m.getZoom(), 14), { duration: 0.6 }); }, [pos?.[0], pos?.[1]]); return null; }
function Ctx({ onCtx }: { onCtx: (p: any) => void }) { useMapEvents({ contextmenu: (e) => onCtx({ lat: e.latlng.lat, lng: e.latlng.lng, x: e.containerPoint.x, y: e.containerPoint.y }), click: () => onCtx(null) }); return null; }

// Status ao vivo: crítico enquanto houver evento ativo ou sem tratamento (lib/critical.ts); ler o alerta não muda o status

const TILE_ERRORS = 6; // a partir de quantos blocos do mapa falhando o erro aparece

export default function Monitoramento() {
  const nav = useNavigate();
  const assets = useStore((s) => s.assets.filter((a: any) => a.tracker));
  const vehicles = useStore((s) => s.vehicles);
  const groups = useStore((s) => s.groups);
  const drivers = useStore((s) => s.drivers);
  const fences = useStore((s) => s.fences);
  const crit = useCriticalMap();
  const kindOf = (assetId: string, v: any): StatusKind => (crit.has(assetId) ? 'crit' : statusKind(vehicleStatus(v).key));
  const [q, setQ] = useState('');
  const [st, setSt] = useState('todos');
  const [grp, setGrp] = useState('');
  const [sp] = useSearchParams();
  const [sel, setSel] = useState<string | null>(sp.get('ativo'));
  const [showF, setShowF] = useState(true);
  const [cmd, setCmd] = useState<null | { target: 'veiculo' | 'grupo'; assetId?: string; defId?: string }>(null);
  // comando direto no veículo (sprint 28/10/2026, melhoria 2): abre o envio já com veículo e comando escolhidos; a senha
  // continua obrigatória no modal
  const comandar = (assetId: string, defId?: string) => setCmd({ target: 'veiculo', assetId, defId });
  const [vctx, setVctx] = useState<null | { x: number; y: number; id: string }>(null);
  // Esc fecha o painel do veículo, a menos que haja um diálogo aberto por cima (ele fecha primeiro)
  useEffect(() => {
    if (!sel) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !cmd && !document.querySelector('[aria-modal="true"]')) { e.preventDefault(); setSel(null); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [sel, cmd]);
  const [ctx, setCtx] = useState<any>(null);
  const [shareA, setShareA] = useState<any>(null);
  const [pass, setPass] = useState<any>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [tileErr, setTileErr] = useState(0);
  const [tileKey, setTileKey] = useState(0);
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('ruas');
  const [grouped, setGrouped] = useState(true);
  const [styleMenu, setStyleMenu] = useState<{ x: number; y: number } | null>(null);
  // celular: mapa e lista não cabem lado a lado nem empilhados (a lista empurrava o mapa para fora da tela); um de cada vez
  const [view, setView] = useState<'mapa' | 'lista'>('mapa');
  const mapSectionRef = useRef<HTMLElement>(null);
  const styleBtnRef = useRef<HTMLSpanElement>(null);
  // Tela cheia (sprint 28/10/2026, melhoria 1): área de trabalho com mapa, cards (visão vertical) e tabela, juntos ou
  // separados. É um modo da própria tela (fixed por cima do menu); no clique também pede a tela cheia do navegador, que
  // só pode ser pedida por gesto do usuário — por isso o "abrir em tela cheia" do cliente usa só o modo da tela.
  const email = useStore((s) => s.session?.email);
  const [full, setFull] = useState(false);
  const [visao, setVisaoRaw] = useState<VisaoMonitor>(() => lerVisao(email));
  const setVisao = (v: VisaoMonitor) => { if (!v.cards && !v.tabela) return; setVisaoRaw(v); salvarVisao(email, v); };
  const nativo = useRef(false);
  const entrarTelaCheia = () => { setFull(true); const p = document.documentElement.requestFullscreen?.(); if (p) { nativo.current = true; p.catch(() => { nativo.current = false; }); } };
  const sairTelaCheia = () => { setFull(false); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); nativo.current = false; };
  useScrollLock(full);
  useEffect(() => {
    // Esc na tela cheia do navegador é consumido por ele: o fim da tela cheia nativa encerra o modo da tela junto
    const f = () => { if (!document.fullscreenElement && nativo.current) { nativo.current = false; setFull(false); } };
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  // cliente só de monitoramento (Setup: monitoramento.abrir_tela_cheia) já abre em tela cheia
  useEffect(() => { lerParametro('monitoramento.abrir_tela_cheia').then((v) => { if (Number(v) === 1) setFull(true); }).catch(() => { /* sem o parâmetro, abre normal */ }); }, []);
  useEffect(() => { const id = sp.get('ativo'); if (id) setSel(id); }, [sp]); // busca (⌘K) pode trocar o veículo sem remontar a tela

  const list = [
    ...assets.map((a: any) => { const v = vehicles[a.id]; return { a, v, s: vehicleStatus(v), k: kindOf(a.id, v), d: drivers.find((d: any) => d.id === a.driverId) }; }),
  ];
  const [limit, setLimit] = useState(BATCH);
  useEffect(() => setLimit(BATCH), [q, st, grp]);
  const counts = list.reduce((m: any, x: any) => ({ ...m, [x.s.key]: (m[x.s.key] || 0) + 1 }), {});
  const shown = list.filter((x: any) => (st === 'todos' || x.s.key === st) && (!grp || x.a.groupIds?.includes(grp)) && (!q || (x.a.name + x.a.plate + (x.d?.name || '') + x.a.model).toLowerCase().includes(q.toLowerCase())));
  const cur = list.find((x: any) => x.a.id === sel);
  // painéis sobre o mapa: na saída mostram o último conteúdo enquanto deslizam para fora
  const vp = usePresence(!!(cur && !pass)), pp = usePresence(!!pass);
  const lastCur = useRef<any>(null), lastPass = useRef<any>(null);
  if (cur && !pass) lastCur.current = cur;
  if (pass) lastPass.current = pass;
  const lastUpd = Math.max(0, ...list.filter((x: any) => x.v && !x.v.noSignal).map((x: any) => x.v.lastUpdate));
  const history = useStore((s) => s.history);
  const alerts = useStore((s) => s.alerts);
  const moving = list.filter((x: any) => x.v && !x.v.noSignal && x.v.speed > 2);
  const kmHoje = useMemo(() => {
    const t0 = new Date().setHours(0, 0, 0, 0);
    let km = 0;
    for (const a of assets) { const h = history[a.id] || []; for (let i = 1; i < h.length; i++) if (h[i][0] >= t0) km += haversine([h[i - 1][1], h[i - 1][2]], [h[i][1], h[i][2]]); }
    return km / 1000;
  }, [assets, history]);
  const velMedia = moving.length ? moving.reduce((s: number, x: any) => s + x.v.speed, 0) / moving.length : 0;
  const movimentacao = useMemo(() => {
    const now = Date.now(), step = 3 * DAY / 24;
    const buckets = Array.from({ length: 8 }, (_, i) => ({ from: now - (8 - i) * step, to: now - (7 - i) * step, mov: 0, par: 0 }));
    for (const a of assets) for (const p of history[a.id] || []) {
      const b = buckets.find((bk) => p[0] >= bk.from && p[0] < bk.to);
      if (b) (p[3] > 2 ? b.mov++ : b.par++);
    }
    return buckets.map((b) => ({ label: fmtT(b.to), values: [b.mov, b.par] }));
  }, [assets, history]);
  const ultimosEventos = useMemo(() => [...alerts].sort((a: any, b: any) => b.ts - a.ts).slice(0, 5).map((a: any) => ({
    tone: a.priority === 'alta' ? 'cost' as const : 'plan' as const,
    ts: a.ts, title: a.title, detail: [assets.find((x: any) => x.id === a.assetId)?.name, a.detail].filter(Boolean).join(' · '),
  })), [alerts, assets]);
  useEffect(() => { if (view === 'mapa') map?.invalidateSize(); }, [view, map]); // o mapa volta de display:none
  useEffect(() => { const t = setTimeout(() => map?.invalidateSize(), 60); return () => clearTimeout(t); }, [full, visao.cards, visao.tabela, map]); // o mapa muda de tamanho
  // Esc sai da tela cheia (com o painel do veículo aberto, ele fecha antes: o handler dele marca o evento)
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !sel && !cmd && !document.querySelector('[aria-modal="true"], [role="menu"]')) sairTelaCheia(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [full, cmd, sel]);
  const pick = (id: string) => { setSel(id); setView('mapa'); };
  const fitAll = () => { const pts = list.filter((x: any) => x.v).map((x: any) => x.v.pos); if (map && pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 15 }); };
  const clearFilters = () => { setQ(''); setSt('todos'); setGrp(''); };
  const passAt = (lat: number, lng: number, radius: number) => setPass({ lat, lng, radius, from: toInputDT(Date.now() - DAY), to: toInputDT(Date.now()) });

  const header = (
    <MonitorHeader title="Monitoramento" subtitle={<>Ao vivo · {list.length} veículos rastreados{lastUpd ? <> · atualizado às <time className="num">{fmtT(lastUpd)}</time></> : null}</>}>
      <Button variant="secondary" onClick={() => setCmd({ target: 'grupo' })} disabled={!list.length}><Icon name="comando" size={18} />Comando para grupo</Button>
    </MonitorHeader>
  );

  // nenhum veículo com rastreador: vazio de página
  if (!list.length) return (
    <div className="flex flex-col">
      {header}
      <Card><EmptyState size="page" illustration="ilu-busca-veiculo" title="Nenhum veículo rastreado ainda" detail="Vincule um rastreador ao veículo em Ativos para vê-lo no mapa ao vivo." action={<Button onClick={() => nav('/ativos')}>Abrir ativos</Button>} /></Card>
    </div>
  );

  return (
    <div>
      {header}
      <PageBody>
      <Stack gap="grid">
      <Grid cols={6} equal className="max-md:flex max-md:overflow-x-auto max-md:overscroll-x-contain max-md:-mx-page max-md:px-page max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden max-md:[&>*]:w-[148px] max-md:[&>*]:shrink-0">
        <KpiTile label="Veículos rastreados" value={list.length} status="mov" />
        <KpiTile label="Em movimento" value={counts.mov || 0} status="mov" />
        <KpiTile label="Parados" value={counts.par || 0} status="parado" />
        <KpiTile label="Sem sinal" value={(counts.sem || 0) + (counts.des || 0)} status="nosignal" />
        <KpiTile label="Percurso hoje" value={kmHoje} unit="km" digits={0} />
        <KpiTile label="Velocidade média" value={velMedia} unit="km/h" digits={0} />
      </Grid>
      <Tabs className="md:hidden" value={view} onChange={(k) => setView(k as 'mapa' | 'lista')} tabs={[{ key: 'mapa', label: 'Mapa' }, { key: 'lista', label: 'Lista', count: shown.length }]} />
      <div role={full ? 'dialog' : undefined} aria-label={full ? 'Monitoramento em tela cheia' : undefined}
        className={cx(full && 'fixed inset-0 z-[1100] bg-canvas flex flex-col gap-stack p-3')}>
      {full && (
        <div className="flex flex-wrap items-center gap-stack shrink-0">
          <div className="min-w-0 mr-auto">
            <h1 className="text-h3 font-semibold leading-tight">Monitoramento</h1>
            <p className="text-caption text-ink-2">Ao vivo · {list.length} veículos{lastUpd ? <> · atualizado às <time className="num">{fmtT(lastUpd)}</time></> : null}</p>
          </div>
          <SearchInput className="w-64" value={q} onChange={setQ} placeholder="Buscar placa, motorista ou modelo" aria-label="Buscar veículo" />
          <Select aria-label="Grupo" value={grp} onChange={(e) => setGrp(e.target.value)} options={[{ value: '', label: 'Todos os grupos' }, ...groups.map((g: any) => ({ value: g.id, label: g.name }))]} />
          <div role="group" aria-label="Visão" className="flex gap-tight">
            <Button variant={visao.cards ? 'dark' : 'secondary'} size="sm" aria-pressed={visao.cards} disabled={visao.cards && !visao.tabela} title={visao.cards && !visao.tabela ? 'Ligue a tabela para poder esconder os cards' : undefined} onClick={() => setVisao({ ...visao, cards: !visao.cards })}><Icon name="ativos" size={16} />Cards</Button>
            <Button variant={visao.tabela ? 'dark' : 'secondary'} size="sm" aria-pressed={visao.tabela} disabled={visao.tabela && !visao.cards} title={visao.tabela && !visao.cards ? 'Ligue os cards para poder esconder a tabela' : undefined} onClick={() => setVisao({ ...visao, tabela: !visao.tabela })}><Icon name="relatorios" size={16} />Tabela</Button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCmd({ target: 'grupo' })}><Icon name="comando" size={16} />Comando para grupo</Button>
          <Button variant="secondary" size="sm" onClick={sairTelaCheia} title="Sair da tela cheia (Esc)"><Icon name="tela-cheia" size={16} />Sair da tela cheia</Button>
        </div>
      )}
      <div className={full ? 'flex-1 min-h-0 flex gap-stack' : 'flex flex-wrap items-start gap-grid'}>
        <Card dense className={full
          ? cx('w-[360px] shrink-0 h-full max-md:hidden', !visao.cards && 'hidden')
          : cx('flex-[1_1_340px] md:max-w-[420px] h-[70vh] max-md:supports-[height:100dvh]:h-[70dvh] min-h-[360px] md:h-[calc(100vh/var(--ui-zoom)-128px)] md:min-h-[560px]', view === 'mapa' && 'max-md:hidden')}>
          <section aria-label="Veículos" className="flex flex-col gap-stack h-full min-h-0">
            {!full && <SearchInput value={q} onChange={setQ} placeholder="Buscar placa, motorista ou modelo" aria-label="Buscar veículo" />}
            {!full && <Select aria-label="Grupo" value={grp} onChange={(e) => setGrp(e.target.value)} options={[{ value: '', label: 'Todos os grupos' }, ...groups.map((g: any) => ({ value: g.id, label: g.name }))]} />}
            <ul className="flex-1 min-h-0 overflow-y-auto -mx-2 pb-16" aria-label={`${shown.length} veículos`}>
              {shown.slice(0, Math.max(limit, shown.findIndex((x: any) => x.a.id === sel) + 1)).map(({ a, v, k, d }: any) => (
                <li key={a.id}>
                  <VehicleListItem silhouette={silhouetteOf(a)} icon={a.icon} photo={a.photo} plate={a.name} kind={k} selected={sel === a.id} onClick={() => pick(a.id)}
                    model={[a.brand, a.model].filter(Boolean).join(' ')} driver={d?.name || 'Sem motorista'} pos={v?.pos}
                    speed={v && !v.noSignal ? Math.round(v.speed) : null} time={v ? fmtT(v.lastUpdate) : ''}
                    menu={[{ icon: 'cadeado', label: 'Bloquear', danger: true, onClick: () => comandar(a.id, 'c_bloq') }, { icon: 'cadeado', label: 'Desbloquear', onClick: () => comandar(a.id, 'c_desb') },
                      { icon: 'comando', label: 'Outros comandos', onClick: () => comandar(a.id) }, { icon: 'rota', label: 'Percurso', onClick: () => nav(`/monitoramento/replay?a=${a.id}`) }]} />
                </li>
              ))}
              {shown.length > limit && <MoreOnScroll onMore={() => setLimit((l) => l + BATCH)} />}
              {shown.length === 0 && <li><EmptyState illustration="ilu-busca-veiculo" title="Nenhum veículo com esses filtros" detail="Tente ajustar os filtros ou limpar a pesquisa." action={<Button variant="dark" size="sm" onClick={clearFilters}>Limpar filtros</Button>} /></li>}
            </ul>
          </section>
        </Card>

        <div className={full ? 'flex-1 min-w-0 flex flex-col gap-stack' : 'contents'}>
        <section ref={mapSectionRef} aria-label="Mapa" className={full
          ? 'flex-1 min-h-[240px] relative rounded-card overflow-hidden border border-line'
          : cx('flex-[999_1_480px] min-w-0 relative rounded-card overflow-hidden border border-line h-[62vh] max-md:supports-[height:100dvh]:h-[62dvh] min-h-[360px] md:h-[calc(100vh/var(--ui-zoom)-128px)] md:min-h-[560px]', view === 'lista' && 'max-md:hidden')}>
          <MapContainer ref={setMap} center={[-8.1, -34.92]} zoom={12} className="w-full h-full" zoomControl={false}>
            <TileLayer key={`${tileKey}-${mapStyle}`} url={MAP_STYLES[mapStyle].url} attribution={MAP_STYLES[mapStyle].attribution} keepBuffer={6} updateWhenZooming={false} eventHandlers={{ tileerror: () => setTileErr((n) => n + 1) }} />
            {showF && <FenceShapes fences={fences} />}
            <ClusteredVehicles selected={sel} grouped={grouped} items={list.filter((x: any) => x.v).map(({ a, v, k }: any) => ({ id: a.id, pos: v.pos, kind: k, node: () => <GlideMarker category={glyphOf(a)} position={v.pos} title={`${a.name} · ${STATUS_LABEL[k as StatusKind]}`} plate={a.name} kind={k} heading={v.heading} selected={sel === a.id} onClick={() => setSel(a.id)} onContextMenu={(pt) => { setCtx(null); setVctx({ ...pt, id: a.id }); }} /> }))} />
            {pass && <Circle center={[pass.lat, pass.lng]} radius={pass.radius} pathOptions={{ color: tv('--graphite'), weight: 1.5, dashArray: '5 5', fillColor: tv('--graphite'), fillOpacity: 0.06 }} />}
            <FlyTo pos={cur?.v?.pos} />
            <Ctx onCtx={(p) => { setCtx(p); setVctx(null); }} />
          </MapContainer>

          <div className="absolute top-3 left-3 right-3 z-[400] flex flex-col items-start gap-tight pointer-events-none [&>*]:pointer-events-auto">
          <div className="flex flex-wrap gap-tight">
            <MapButton icon="cerca" label="Cercas" pressed={showF} onClick={() => setShowF(!showF)} />
            <MapButton icon="busca" label="Passou por aqui" title="Quem passou pelo ponto no centro do mapa. Para escolher outro ponto: botão direito no computador, toque longo no celular." onClick={() => { const c = map?.getCenter(); if (c) passAt(c.lat, c.lng, 300); }} />
            <MapButton icon="equipe" label="Agrupar" pressed={grouped} title={grouped ? 'Agrupando veículos próximos' : 'Mostrando todos os veículos'} onClick={() => setGrouped(!grouped)} />
            <span ref={styleBtnRef}>
              <MapButton icon="camadas" label="Estilo do mapa" title="Trocar o estilo do mapa"
                onClick={() => {
                  const r = styleBtnRef.current && rectUi(styleBtnRef.current), sec = mapSectionRef.current && rectUi(mapSectionRef.current);
                  if (r && sec) setStyleMenu(styleMenu ? null : { x: r.left - sec.left, y: r.bottom - sec.top + 6 });
                }} />
            </span>
          </div>
          <div>
            <MapControls items={[
              { icon: 'zoom-mais', label: 'Aproximar', onClick: () => map?.zoomIn() },
              { icon: 'zoom-menos', label: 'Afastar', onClick: () => map?.zoomOut() },
              { icon: 'centralizar', label: 'Ver a frota toda', onClick: fitAll },
              { icon: 'tela-cheia', label: full ? 'Sair da tela cheia' : 'Tela cheia', onClick: full ? sairTelaCheia : entrarTelaCheia },
            ]} />
          </div>
          </div>
          {styleMenu && (
            <ContextMenu x={styleMenu.x} y={styleMenu.y} onClose={() => setStyleMenu(null)} header="Estilo do mapa"
              items={(Object.keys(MAP_STYLES) as MapStyleKey[]).map((k) => ({ label: MAP_STYLES[k].label, icon: MAP_STYLES[k].icon, onClick: () => setMapStyle(k) }))} />
          )}

          {tileErr >= TILE_ERRORS && (
            <div className="absolute inset-x-3 top-16 z-[500] flex justify-center">
              <Card dense className="w-full max-w-[560px] shadow-pop">
                <ErrorState illustration="ilu-erro" layout="row" title="Não foi possível carregar o mapa" detail="Verifique sua conexão. Os veículos continuam na lista ao lado." onRetry={() => { setTileErr(0); setTileKey((n) => n + 1); }} />
              </Card>
            </div>
          )}

          {ctx && (
            <ContextMenu x={Math.max(8, Math.min(ctx.x, (mapSectionRef.current?.clientWidth ?? 600) - 264))} y={Math.max(8, Math.min(ctx.y, (mapSectionRef.current?.clientHeight ?? 600) - 200))} onClose={() => setCtx(null)} header={<span className="num">{ctx.lat.toFixed(5)}, {ctx.lng.toFixed(5)}</span>} items={[
              { label: 'Passou por aqui…', icon: 'busca', onClick: () => passAt(ctx.lat, ctx.lng, 200) },
              { label: 'Criar cerca neste ponto', icon: 'cerca', to: `/monitoramento/cercas?lat=${ctx.lat}&lng=${ctx.lng}` },
              { label: 'Copiar coordenadas', icon: 'duplicar', onClick: () => { const p = navigator.clipboard?.writeText(`${ctx.lat.toFixed(6)}, ${ctx.lng.toFixed(6)}`); p ? p.then(() => toast('Coordenadas copiadas.'), () => toast.error('Selecione e copie à mão.', 'Não foi possível copiar')) : toast.error('Selecione e copie à mão.', 'Não foi possível copiar'); } },
            ]} />
          )}
          {vctx && (() => {
            const va = list.find((x: any) => x.a.id === vctx.id);
            if (!va) return null;
            return (
              <ContextMenu x={Math.max(8, Math.min(vctx.x, (mapSectionRef.current?.clientWidth ?? 600) - 264))} y={Math.max(8, Math.min(vctx.y, (mapSectionRef.current?.clientHeight ?? 600) - 220))} onClose={() => setVctx(null)}
                header={<span className="font-medium">{va.a.name}</span>} items={[
                  { label: 'Bloquear', icon: 'cadeado', onClick: () => comandar(va.a.id, 'c_bloq') },
                  { label: 'Desbloquear', icon: 'cadeado', onClick: () => comandar(va.a.id, 'c_desb') },
                  { label: 'Outros comandos…', icon: 'comando', onClick: () => comandar(va.a.id) },
                  { label: 'Ver detalhes', icon: 'ativos', onClick: () => setSel(va.a.id) },
                  { label: 'Percurso', icon: 'rota', to: `/monitoramento/replay?a=${va.a.id}` },
                ]} />
            );
          })()}
          {vp.mounted && lastCur.current && <VehiclePanel closing={vp.closing} x={lastCur.current} reasons={crit.get(lastCur.current.a.id) || []} onClose={() => setSel(null)} onCmd={(defId?: string) => comandar(lastCur.current.a.id, defId)} onShare={() => setShareA(lastCur.current.a)} />}
          {pp.mounted && lastPass.current && <PassPanel closing={pp.closing} pass={lastPass.current} setPass={setPass} />}
        </section>
        {full && visao.tabela && (
          <Card dense className={cx('min-h-0 overflow-y-auto', visao.cards ? 'h-[40%]' : 'h-[45%]')}>
            <Table minWidth={760} pageSize={200} card={false} align={['left', 'left', 'right', 'left', 'left', 'left', 'left']}
              head={['Veículo', 'Status', 'Velocidade', 'Ignição', 'Motorista', 'Atualizado', 'Endereço']}
              onRow={(i) => pick(shown[i].a.id)} selected={(i) => shown[i]?.a.id === sel}
              emptyState={<EmptyState icon="busca" layout="row" title="Nenhum veículo com esses filtros" action={<Button variant="dark" size="sm" onClick={clearFilters}>Limpar filtros</Button>} />}
              rows={shown.map(({ a, v, k, d }: any) => [
                <AssetName name={a.name} />, <StatusDot kind={k} label={STATUS_LABEL[k as StatusKind]} />,
                <span className="num">{v && !v.noSignal ? `${Math.round(v.speed)} km/h` : '—'}</span>,
                v ? (v.ignition ? <span className="text-ok">Ligada</span> : <span className="text-ink-2">Desligada</span>) : '—',
                d?.name || <span className="text-ink-2">Sem motorista</span>,
                v ? <time className="num">{fmtT(v.lastUpdate)}</time> : '—',
                v?.pos ? <Address pos={v.pos} className="text-small" /> : '—',
              ])} />
          </Card>
        )}
        </div>
      </div>
      </div>
      </Stack>
      <Grid cols={2} wide>
        <Card dense title="Últimos eventos" to="/monitoramento/alertas" className="h-[352px] overflow-y-auto">
          {ultimosEventos.length ? <Timeline items={ultimosEventos} /> : <EmptyState icon="ok" title="Nenhum evento recente" />}
        </Card>
        <Card dense title="Movimentação nas últimas 24h" className="h-[352px]">
          <div className="h-full flex flex-col justify-center">
            <StackedColumns data={movimentacao} series={[{ label: 'Em movimento', tone: 'real' }, { label: 'Parados', tone: 'loss' }]} height={220} />
          </div>
        </Card>
      </Grid>
      </PageBody>
      <CommandModal state={cmd} onClose={() => setCmd(null)} />
      <ShareModal asset={shareA} onClose={() => setShareA(null)} />
    </div>
  );
}

// Painel do veículo selecionado: status, silhueta (ou foto), placa, métricas do dia, sensores e ações.
function VehiclePanel({ x, reasons, onClose, onCmd, onShare, closing }: any) {
  const { a, v, k, d } = x;
  const kmToday = useStore((st) => { const h = st.history[a.id] || []; const t0 = new Date().setHours(0, 0, 0, 0); let km = 0; for (let i = 1; i < h.length; i++) if (h[i][0] >= t0) km += haversine([h[i - 1][1], h[i - 1][2]], [h[i][1], h[i][2]]); return km / 1000; });
  const odo = useStore((st) => assetKm(st, a.id));
  const fences = useStore((st) => st.fences.filter((f: any) => v?.inside?.includes(f.id)));
  const setPhoto = (data: string) => { useStore.getState().upsert('assets', { id: a.id, photo: data }); toast('Foto do veículo atualizada.'); };
  const hours = a.meter === 'horimetro';
  return (
    <FloatingPanel label={`Detalhe de ${a.name}`} closing={closing} onClose={onClose}
      header={<StatusLine kind={k} sub={[v && !v.noSignal ? `${Math.round(v.speed || 0)} km/h` : null, fences.length ? `em ${fences.map((f: any) => f.name).join(', ')}` : null].filter(Boolean).join(' · ') || undefined} />}
      footer={<>
        <Link to={`/monitoramento/replay?a=${a.id}`} className={buttonClass('secondary', 'sm')}><Icon name="rota" size={16} />Percurso</Link>
        <FilePick accept="image/*" onFile={(data) => setPhoto(data)} className={buttonClass('secondary', 'sm')}><Icon name="camera" size={16} />{a.photo ? 'Trocar foto' : 'Enviar foto'}</FilePick>
        <Button variant="secondary" size="sm" onClick={onShare}><Icon name="compartilhar" size={16} />Compartilhar</Button>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={() => onCmd()}><Icon name="comando" size={16} />Comandos</Button>
        {v?.blocked
          ? <Button size="sm" onClick={() => onCmd('c_desb')}><Icon name="cadeado" size={16} />Desbloquear</Button>
          : <Button variant="danger" size="sm" onClick={() => onCmd('c_bloq')}><Icon name="cadeado" size={16} />Bloquear</Button>}
      </>}>
      <div className="flex items-center gap-grid">
        <AssetThumb asset={a} className="w-28 h-16" />
        <div className="min-w-0 flex flex-col gap-hair">
          <Plate name={a.name} size="lg" className="mb-hair" />
          <p className="text-small text-ink-2 truncate">{a.brand} {a.model} <span className="text-ink-2 num">{String(a.year || '').slice(0, 4)}</span></p>
          <p className="text-small text-ink-2 truncate">{d?.name || 'Sem motorista'}</p>
        </div>
      </div>
      <Pendencias assetId={a.id} reasons={reasons} />
      <div className="grid grid-cols-2 gap-grid mt-card-foot pt-card-foot border-t border-line">
        <div className="flex flex-col gap-hair"><p className="text-caption text-ink-2">Velocidade</p>{v?.noSignal ? <Num value={null} size="lg" className="block text-ink-3" /> : <Num value={Math.round(v?.speed || 0)} unit="km/h" size="lg" />}</div>
        <div className="flex flex-col gap-hair"><p className="text-caption text-ink-2">Rodou hoje</p><Num value={kmToday} unit="km" digits={1} size="lg" /></div>
      </div>
      <DescList className="mt-card-head">
        {v?.noSignal ? <>
          <DescRow label="Comunicação"><StatusDot kind="nosignal" /></DescRow>
          <DescRow label="Última posição"><time className="num">{fmtDT(v.lastUpdate)}</time></DescRow>
        </> : <>
          <DescRow label="Ignição"><StatusDot kind={v?.ignition ? 'mov' : 'off'} label={v?.ignition ? 'Ligada' : 'Desligada'} /></DescRow>
          <DescRow label="Bateria">{v?.battery < BATTERY_LOW_V ? <StatusDot kind="crit" label={`${num(v.battery, 1)} V · baixa`} /> : `${num(v?.battery, 1)} V`}</DescRow>
          <DescRow label="GPS">{v?.gps} satélites</DescRow>
          <DescRow label="Bloqueio">{v?.blocked ? <StatusDot kind="crit" label="Bloqueado" /> : 'Livre'}</DescRow>
          {v?.temp !== undefined && <DescRow label="Temperatura">{a.kind === 'veiculo' && v.temp > -12 ? <StatusDot kind="crit" label={`${num(v.temp, 1)} °C`} /> : `${num(v.temp, 1)} °C`}</DescRow>}
          {v?.door && <DescRow label="Porta do baú">{v.door === 'Aberta' ? <StatusDot kind="parado" label="Aberta" /> : v.door}</DescRow>}
          <DescRow label={hours ? 'Horímetro' : a.kmCalculated ? 'Odômetro (calculado)' : 'Odômetro'}>{hours ? <Num value={v?.hourmeter} unit="h" digits={1} size="body" /> : <Num value={odo} unit="km" size="body" />}</DescRow>
          <DescRow label="Sinal GSM"><span className="inline-flex items-center gap-icon"><Icon name="sinal" size={16} className="text-ink-2" /><span className="num">{v?.gsm}/5</span></span></DescRow>
          <DescRow label="Atualizado"><time className="num">{fmtT(v?.lastUpdate)}</time></DescRow>
        </>}
        <DescRow label="Endereço"><Address pos={v?.pos} className="text-small" /></DescRow>
        <DescRow label="Posição"><span className="num text-caption text-ink-2">{v?.pos?.[0].toFixed(5)}, {v?.pos?.[1].toFixed(5)}</span></DescRow>
      </DescList>
    </FloatingPanel>
  );
}

// link temporário só com a posição atual (lib/shares); lista os links do veículo para revogar
function ShareModal({ asset, onClose }: { asset: any; onClose: () => void }) {
  // veículo real: links no backend (token validado lá, abre em qualquer navegador, aberturas registradas)
  const real = isRealAsset(asset);
  const sharesLocal = useStore((s) => (s.shares || []).filter((x: any) => x.assetId === asset?.id).sort((a: any, b: any) => b.createdAt - a.createdAt));
  const [sharesApi, setSharesApi] = useState<any[]>([]);
  const recarregar = () => { if (real && asset) listarLinks(asset.id).then(setSharesApi).catch((e) => toast.error(e.message, 'Não foi possível carregar os links')); };
  useEffect(() => { setSharesApi([]); recarregar(); }, [asset?.id]);
  const shares = real ? sharesApi : sharesLocal;
  const [ms, setMs] = useState(String(SHARE_DURATIONS[1][0]));
  const [to, setTo] = useState('');
  const [made, setMade] = useState<any>(null);
  const opens = useShareOpens();
  const me = useStore((s) => s.session?.name || s.session?.email || '');
  // sem permissão de área de transferência (aba sem foco, http), o link continua visível para copiar à mão
  const copy = (t: string) => { const p = navigator.clipboard?.writeText(shareUrl(t)); if (p) p.then(() => toast('Link copiado.'), () => toast.error('Selecione o link e copie à mão.', 'Não foi possível copiar')); else toast('Selecione o link e copie.', { tone: 'info' }); };
  return (
    <Modal open={!!asset} width="max-w-3xl" onClose={() => { setMade(null); onClose(); }} title={`Compartilhar localização · ${asset?.name || ''}`}
      footer={<><Button variant="quiet" onClick={() => { setMade(null); onClose(); }}>Fechar</Button><Button onClick={async () => {
        try {
          const sh = real ? await criarLink(asset.id, +ms, to) : createShare(asset.id, +ms, to);
          setMade(sh); copy(sh.token!); setTo(''); recarregar();
        } catch (e: any) { toast.error(e.message || String(e), 'Não foi possível gerar o link'); }
      }}><Icon name="link" size={18} />Gerar link</Button></>}>
      <p className="text-small text-ink-2">Quem abrir o link vê só a posição atual do veículo, sem login, até o prazo acabar. Motorista, histórico e comandos não aparecem.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
        <Field label="Válido por"><Select value={ms} onChange={(e) => setMs(e.target.value)} options={SHARE_DURATIONS.map(([v, l]) => ({ value: String(v), label: l }))} /></Field>
        <Field label="Para quem (opcional)"><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Ex.: cliente Atacadão, recebimento" /></Field>
      </div>
      {made && <div className="flex items-center gap-tight"><Input readOnly value={shareUrl(made.token)} aria-label="Link gerado" onFocus={(e) => e.target.select()} /><Button variant="secondary" onClick={() => copy(made.token)}><Icon name="duplicar" size={18} />Copiar</Button></div>}
      {shares.length > 0 && <>
        <h3 className="text-body font-semibold mt-card-head">Links deste veículo</h3>
        <Table head={['Para', 'Criado', 'Situação', 'Aberturas', '']} rows={shares.map((x: any) => {
          const st = shareState(x);
          return [x.to || <span className="text-ink-3">—</span>, <time className="num">{fmtDT(x.createdAt)}</time>,
            <StatusDot kind={st === 'ativo' ? 'mov' : 'off'} label={st === 'ativo' ? `até ${fmtDT(x.expiresAt)}` : st === 'revogado' ? 'Desativado' : 'Expirado'} />,
            x.by === me ? ((real ? x.opens : opens[x.token])?.length ? <span className="flex flex-col text-small"><span className="num font-medium">{(real ? x.opens : opens[x.token]).length} {(real ? x.opens : opens[x.token]).length === 1 ? 'vez' : 'vezes'}</span><span className="text-caption text-ink-2 num" title={(real ? x.opens : opens[x.token]).map((t: number) => fmtDT(t)).join(', ')}>última {fmtDT((real ? x.opens : opens[x.token]).at(-1))}</span></span> : <span className="text-small text-ink-2">Ainda não aberto</span>) : <span className="text-small text-ink-2">Só quem criou vê</span>,
            st === 'ativo' ? <span className="flex gap-stack">{x.token && <TextButton onClick={() => copy(x.token)}>Copiar</TextButton>}<TextButton tone="danger" onClick={async () => {
              try { if (real) { await revogarLink(x.id); recarregar(); } else revokeShare(x.token); toast('Link desativado.'); }
              catch (e: any) { toast.error(e.message || String(e), 'Não foi possível desativar'); }
            }}>Desativar</TextButton></span> : null];
        })} />
      </>}
    </Modal>
  );
}

function PassPanel({ pass, setPass, closing }: any) {
  const history = useStore((s) => s.history);
  const assets = useStore((s) => s.assets);
  const drivers = useStore((s) => s.drivers);
  const [run, setRun] = useState(0);
  const rows = useMemo(() => {
    const from = new Date(pass.from).getTime(), to = new Date(pass.to).getTime();
    const out: any[] = [];
    for (const [aid, h] of Object.entries<any>(history)) {
      let cur: any = null;
      for (const p of h) {
        if (p[0] < from || p[0] > to) continue;
        const inside = haversine([pass.lat, pass.lng], [p[1], p[2]]) <= pass.radius;
        if (inside && !cur) cur = { aid, in: p[0], out: p[0], vmax: p[3] };
        else if (inside && cur) { cur.out = p[0]; cur.vmax = Math.max(cur.vmax, p[3]); }
        else if (!inside && cur) { out.push(cur); cur = null; }
      }
      if (cur) out.push(cur);
    }
    return out.sort((a, b) => b.in - a.in);
  }, [run, pass.lat, pass.lng, pass.radius]);
  const a = (id: string) => assets.find((x: any) => x.id === id);
  return (
    <FloatingPanel side="bottom" label="Passou por aqui" title="Passou por aqui" subtitle={<span className="num">{pass.lat.toFixed(5)}, {pass.lng.toFixed(5)}</span>} closing={closing} onClose={() => setPass(null)}>
      <div className="flex flex-wrap gap-field items-end mb-card-head">
        <Field label="Raio"><Select value={pass.radius} onChange={(e) => setPass({ ...pass, radius: +e.target.value })} options={['100', '200', '300', '500', '1000'].map((v) => ({ value: v, label: v + ' m' }))} /></Field>
        <Field label="De"><Input type="datetime-local" value={pass.from} onChange={(e) => setPass({ ...pass, from: e.target.value })} /></Field>
        <Field label="Até"><Input type="datetime-local" value={pass.to} onChange={(e) => setPass({ ...pass, to: e.target.value })} /></Field>
        <Button onClick={() => setRun(run + 1)}>Gerar relatório</Button>
      </div>
      <Table head={['Veículo', 'Motorista', 'Entrada no raio', 'Saída', 'Permanência', 'Vel. máx.']} align={['left', 'left', 'left', 'left', 'right', 'right']}
        emptyState={<EmptyState illustration="ilu-busca-veiculo" layout="row" title="Nenhum veículo passou por este ponto no período" detail="Aumente o raio ou o período e gere o relatório de novo." />}
        rows={rows.map((r) => [<AssetName name={a(r.aid)?.name} />, drivers.find((d: any) => d.id === a(r.aid)?.driverId)?.name || '—', <time className="num">{fmtDT(r.in)}</time>, <time className="num">{fmtDT(r.out)}</time>, <Num value={Math.max(1, Math.round((r.out - r.in) / 60000))} unit="min" size="body" />, <Num value={r.vmax} unit="km/h" size="body" />])} />
    </FloatingPanel>
  );
}

// Acompanha o último comando enviado no toast: enviado → aguardando rastreador → confirmado ou falhou.
function trackCommand(label: string) {
  const id = useStore.getState().commands[0]?.id;
  const t = toast.command(label);
  const wait = setTimeout(() => t.waiting(), 300);
  const unsub = useStore.subscribe((s: any) => {
    const c = s.commands.find((x: any) => x.id === id);
    if (!c) return;
    const st = Object.values(c.status) as string[], n = st.length, left = st.filter((x) => x === 'enviado').length;
    if (left) { if (n > 1 && left < n) { clearTimeout(wait); t.waiting(`Aguardando rastreadores · ${n - left} de ${n}`); } return; }
    unsub(); clearTimeout(wait);
    const fail = st.filter((x) => x !== 'confirmado').length;
    if (!fail) t.confirmed(n > 1 ? `Confirmado pelos ${n} rastreadores` : undefined);
    else t.failed(n > 1 ? `${fail} de ${n} sem confirmação (rastreador sem sinal)` : 'Sem confirmação: o rastreador está sem sinal');
  });
}

export function CommandModal({ state, onClose }: { state: null | { target: 'veiculo' | 'grupo'; assetId?: string; defId?: string }; onClose: () => void }) {
  const defs = useStore((s) => s.commandDefs);
  const assets = useStore((s) => s.assets.filter((a: any) => a.tracker));
  const groups = useStore((s) => s.groups);
  const commands = useStore((s) => s.commands);
  const [target, setTarget] = useState<'veiculo' | 'grupo'>('veiculo');
  const [assetId, setAssetId] = useState('');
  const [groupId, setGroupId] = useState('g1');
  const [defId, setDefId] = useState('c_bloq');
  const [free, setFree] = useState('');
  const [msg, setMsg] = useState('Reduza a velocidade — área escolar');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (state) { setTarget(state.target); if (state.defId) setDefId(state.defId); setAssetId(state.assetId || assets[0]?.id); setPwd(''); setErr(''); } }, [state]);
  // sintaxe técnica e comando livre só para a equipe Localle/revenda (lib/support.ts)
  const tecnico = veSintaxeComando(useStore((s) => s.session));
  const def = defId === 'livre' ? { id: 'livre', name: 'Comando livre', payload: free, kind: 'livre' } : defs.find((d: any) => d.id === defId);
  const ids = target === 'veiculo' ? [assetId] : assets.filter((a: any) => a.groupIds?.includes(groupId)).map((a: any) => a.id);
  const name = (id: string) => assets.find((a: any) => a.id === id)?.name;
  const send = async () => {
    if (defId === 'livre' && !free.trim()) return setErr('Escreva o comando livre.');
    const ok = await confirmarSenha(useStore.getState().session?.email || '', pwd).catch(() => false);
    if (!ok) return setErr('Senha incorreta. Confirme com a sua senha de acesso.');
    const cmdId = useStore.getState().sendCommand({ defId, name: def.name, payload: def.payload, kind: def.kind, target, assetIds: ids, message: def.kind === 'alerta' ? msg : undefined });
    trackCommand(`${def.name} · ${target === 'veiculo' ? name(assetId) : `${ids.length} veículos`}`);
    // veículo real: quem confirma é o próprio rastreador (sendRealCommand faz o envio e a conferência de verdade)
    for (const aid of ids) {
      const a = assets.find((x: any) => x.id === aid);
      if (a?.tracker?.source === 'localle') enviarComandoLocalle(cmdId, aid, def.kind, def.payload, def.name).catch((e: any) => toast('Comando recusado: ' + (e.message || e), { tone: 'crit' }));
      else if (a?.tracker?.live) sendRealCommand(cmdId, aid, a.tracker.imei, def.name, def.payload, def.kind);
    }
    setPwd(''); setErr('');
  };
  return (
    <Modal open={!!state} onClose={onClose} title="Enviar comando" width="max-w-3xl">
      <div className="flex flex-wrap gap-stack items-center">
        <Tabs value={target} onChange={(k) => setTarget(k as any)} tabs={[{ key: 'veiculo', label: 'Veículo' }, { key: 'grupo', label: 'Grupo de veículos' }]} />
        {target === 'veiculo' ? <SearchSelect aria-label="Veículo" className="w-56" value={assetId} onChange={setAssetId} options={assets.map((a: any) => ({ value: a.id, label: a.name }))} />
          : <Select aria-label="Grupo" className="w-64" value={groupId} onChange={(e) => setGroupId(e.target.value)} options={groups.map((g: any) => ({ value: g.id, label: `${g.name} (${assets.filter((a: any) => a.groupIds?.includes(g.id)).length})` }))} />}
      </div>
      <div role="radiogroup" aria-label="Comando" className="grid grid-cols-2 md:grid-cols-3 gap-tight">
        {[...defs, ...(tecnico ? [{ id: 'livre', name: 'Comando livre', desc: 'Texto direto ao equipamento' }] : [])].map((d: any) => (
          <ChoiceCard key={d.id} checked={defId === d.id} onSelect={() => setDefId(d.id)} title={d.name} description={d.desc} meta={tecnico ? d.payload : undefined} tone={d.kind === 'bloqueio' ? 'danger' : undefined} />
        ))}
      </div>
      {tecnico && defId === 'livre' && <Field label="Comando livre (sintaxe do rastreador)"><Textarea rows={2} className="font-mono" placeholder="Ex.: RELAY,1#" value={free} onChange={(e) => setFree(e.target.value)} /></Field>}
      {def?.kind === 'alerta' && <Field label="Mensagem exibida no teclado / app do motorista"><Input value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>}
      <div className="flex flex-wrap gap-field items-end">
        <Field label="Confirme com sua senha" className="flex-1 min-w-[200px]"><Input type="password" value={pwd} invalid={!!err} onChange={(e) => setPwd(e.target.value)} placeholder="Sua senha de acesso" /></Field>
        <Button variant={def?.kind === 'bloqueio' ? 'danger' : 'primary'} onClick={send} disabled={!ids.length}><Icon name="enviar" size={18} />Enviar {def?.name?.toLowerCase()} para {ids.length} {ids.length === 1 ? 'veículo' : 'veículos'}</Button>
      </div>
      {err && <Callout tone="crit">{err}</Callout>}
      <div className="border-t border-line pt-card-foot mt-tight">
        <h3 className="text-body font-semibold mb-tight">Últimos comandos</h3>
        {commands.length === 0 ? <EmptyState icon="comando" title="Nenhum comando enviado" detail="Os comandos aparecem aqui com a confirmação do rastreador." />
          : <Table minWidth={560} head={['Quando', 'Comando', 'Destino', 'Status']} rows={commands.slice(0, 6).map((c: any) => {
            const vals = Object.values(c.status); const ok = vals.filter((x) => x === 'confirmado').length; const pend = vals.filter((x) => x === 'pendente').length; const ruim = vals.filter((x) => ['falhou', 'expirado', 'cancelado', 'nao_suportado'].includes(x as string)).length;
            return [<time className="num">{fmtDT(c.ts)}</time>, c.name + (c.message ? ` · "${c.message}"` : ''), c.target === 'grupo' ? `${c.assetIds.length} veículos` : <AssetName name={name(c.assetIds[0])} />, <Badge tone={ok === vals.length ? 'green' : ruim ? 'red' : 'orange'}>{ok === vals.length ? 'Confirmado pelo rastreador' : ruim ? ({ falhou: 'Falhou no envio', expirado: 'Sem confirmação no prazo', cancelado: 'Substituído por outro comando', nao_suportado: 'Não disponível para este rastreador' } as any)[vals.find((x) => ['falhou', 'expirado', 'cancelado', 'nao_suportado'].includes(x as string)) as string] : pend ? `${pend} aguardando o rastreador` : `${ok}/${vals.length} confirmados`}</Badge>];
          })} />}
      </div>
    </Modal>
  );
}

// Pendências que deixam o veículo crítico. Só saem quando tratadas (com motivo) ou quando o evento termina.
function Pendencias({ assetId, reasons }: { assetId: string; reasons: CritReason[] }) {
  const [pick, setPick] = useState<CritReason[] | null>(null);
  const treated = useStore((s) => recentTreatments(s, assetId));
  return (
    <>
      {reasons.length > 0 && (
        <Panel dense tone="muted" className="mt-card-head" aria-label="Pendências">
          <StatusLine kind="crit" label={reasons.length === 1 ? '1 pendência' : `${reasons.length} pendências`} />
          <List className="mt-tight">
            {reasons.map((r) => (
              <ListItem key={r.key} className="flex items-start gap-stack py-tight">
                <span className="min-w-0 mr-auto flex flex-col gap-hair"><span className="block text-body font-medium">{r.title}</span><span className="block text-caption text-ink-2">{r.detail} · desde <time className="num">{shortDT(r.since)}</time></span></span>
                <Button size="sm" variant="secondary" onClick={() => setPick([r])}>Tratar</Button>
              </ListItem>
            ))}
          </List>
          {reasons.length > 1 && <TextButton onClick={() => setPick(reasons)} className="mt-hair">Tratar todas</TextButton>}
        </Panel>
      )}
      {treated.length > 0 && (
        <section aria-label="Tratadas nas últimas 24 horas" className="mt-card-head">
          <h3 className="text-caption text-ink-2 mb-hair">Tratadas nas últimas 24 h</h3>
          <List>
            {treated.slice(0, 4).map((t) => <ListItem key={t.key} className="py-tight"><span className="block text-small">{t.title}</span><TreatedLine by={t.by} at={t.at} reason={t.reason} note={t.note} /></ListItem>)}
          </List>
        </section>
      )}
      <TreatDialog subject={pick ? (pick.length === 1 ? pick[0].title : `${pick.length} pendências`) : null} detail={pick?.length === 1 ? pick[0].detail : pick?.map((r) => r.title).join(' · ')}
        onClose={() => setPick(null)} onConfirm={(t) => pick && resolveReasons(assetId, pick, t)} />
    </>
  );
}
