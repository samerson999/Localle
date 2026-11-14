import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { rectUi } from '../lib/uiZoom';
import { useAlturaLivre } from '../lib/alturaLivre';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap, useMapEvents, Circle } from 'react-leaflet';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore, useAgora, vehicleStatus, contarStatusFrota, ignicaoAtual, assetKm, type StatusFrota } from '../lib/store';
import { Button, Badge, usePresence, useIsMobile, Menu, useScrollLock, toast, confirmAction, List, ListItem, DescList, DescRow, TextButton, Field, Input, SearchInput, Select, SearchSelect, Modal, Table, Textarea, Tabs, FilePick, Card, Panel, Callout, FloatingPanel, ContextMenu, ChoiceCard, EmptyState, ErrorState, buttonClass, PageBody, Stack, Grid, cx, AssetThumb, IconButton, Tooltip } from '../components/ui';
import { MonitorHeader } from '../components/MonitorTabs';
import { glyphOf, silhouetteOf } from '../components/assetArt';
import { GlideMarker, ClusteredVehicles, Address, FenceShapes, MapButton, MapControls, VehicleListItem, MAP_STYLES, type MapStyleKey } from '../components/MapBits';
import { Num, Plate, AssetName, StatusDot, StatusLine, statusKind, STATUS_LABEL, KpiTile, type StatusKind } from '../components/story';
import { Icon } from '../components/icons';
import { tv } from '../lib/tokens';
import { useCriticalMap, resolveReasons, recentTreatments, type CritReason } from '../lib/critical';
import { BATTERY_LOW_V } from '@localle/shared/engine';
import { TreatDialog, TreatedLine } from '../components/TreatDialog';
import { capacidadesComando, confirmarSenha, criarLink, enviarComandoLocalle, isRealAsset, lerParametro, listarLinks, revogarLink, tipoComandoLocalle, useResumoUso } from '../lib/localleApi';
import { lerVisao, salvarVisao, type VisaoMonitor } from '../lib/monitorPrefs';
import { leituraAntiga } from '../lib/diagnosticoRastreador';
import { velocidadePainelAtual } from '../lib/localleMap';
import { SHARE_DURATIONS, shareUrl, shareState, createShare, revokeShare, useShareOpens } from '../lib/shares';
import { fmtDT, haversine, num, toInputDT, shortDT, DAY } from '@localle/shared/utils';
import { sendRealCommand } from '../lib/rastreioApi';
import { veSintaxeComando } from '../lib/support';

// Lista ao vivo em lotes: com 600–2.000 veículos, montar todas as linhas de uma vez trava a rolagem. Mostra 80
// e acrescenta mais 80 quando o fim da lista aparece (IntersectionObserver), sem biblioteca de virtualização.
const BATCH = 80;
function MoreOnScroll({ onMore }: { onMore: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(([e]) => e.isIntersecting && onMore(), { rootMargin: '200px' }); io.observe(el); return () => io.disconnect(); }, [onMore]);
  return <li ref={ref} aria-hidden="true" className="h-px" />;
}

// Mede o mapa antes de voar: no celular, tocar um veículo na aba Lista mostra o mapa (que estava em display:none) no mesmo
// render, e este efeito roda antes do invalidateSize do pai. Com o tamanho guardado em 0×0 o flyTo calcula NaN e o mapa
// inteiro fica cinza, sem blocos.
function FlyTo({ pos }: { pos?: [number, number] }) {
  const m = useMap();
  useEffect(() => {
    if (!pos) return;
    m.invalidateSize({ pan: false });
    const s = m.getSize();
    if (!s.x || !s.y) return; // ainda escondido: nada a centralizar
    m.flyTo(pos, Math.max(m.getZoom(), 14), { duration: 0.6 });
  }, [pos?.[0], pos?.[1]]);
  return null;
}
function Ctx({ onCtx }: { onCtx: (p: any) => void }) { useMapEvents({ contextmenu: (e) => onCtx({ lat: e.latlng.lat, lng: e.latlng.lng, x: e.containerPoint.x, y: e.containerPoint.y }), click: () => onCtx(null) }); return null; }

// Status ao vivo: crítico enquanto houver evento ativo ou sem tratamento (lib/critical.ts); ler o alerta não muda o status

const TILE_ERRORS = 6; // a partir de quantos blocos do mapa falhando o erro aparece

// Celular: o globo em tela cheia com a lista numa folha (MonitoramentoGlobo, molde da Revolut, 11/11/2026). Carregado à
// parte: o MapLibre só baixa no celular, e o desktop segue no mapa Leaflet abaixo.
const MonitoramentoGlobo = lazy(() => import('./MonitoramentoGlobo'));

export default function Monitoramento() {
  const mobile = useIsMobile();
  if (mobile) return <Suspense fallback={<div aria-busy="true" className="fixed inset-0 z-[1055] bg-canvas" />}><MonitoramentoGlobo /></Suspense>;
  return <MonitoramentoMapa />;
}

function MonitoramentoMapa() {
  const nav = useNavigate();
  const assets = useStore(useShallow((s) => s.assets.filter((a: any) => a.tracker)));
  const vehicles = useStore((s) => s.vehicles);
  const groups = useStore((s) => s.groups);
  const drivers = useStore((s) => s.drivers);
  const fences = useStore((s) => s.fences);
  const crit = useCriticalMap();
  const agora = useAgora(); // o status vence com o tempo (posição recente): re-renderiza mesmo sem posição nova
  const kindOf = (assetId: string, v: any): StatusKind => (crit.has(assetId) ? 'crit' : statusKind(vehicleStatus(v, agora).key));
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
  const [grouped, setGrouped] = useState(false); // abre mostrando todos os veículos; agrupar é escolha de quem olha
  const [styleMenu, setStyleMenu] = useState<{ x: number; y: number } | null>(null);
  const mobile = useIsMobile();
  const mapSectionRef = useRef<HTMLElement>(null);
  const styleBtnRef = useRef<HTMLSpanElement>(null);
  // Tela cheia (sprint 28/10/2026, melhoria 1): área de trabalho com mapa, cards (visão vertical) e tabela, juntos ou
  // separados. É um modo da própria tela (fixed por cima do menu); no clique também pede a tela cheia do navegador, que
  // só pode ser pedida por gesto do usuário — por isso o "abrir em tela cheia" do cliente usa só o modo da tela.
  const email = useStore((s) => s.session?.email);
  const [full, setFull] = useState(false);
  const [visao, setVisaoRaw] = useState<VisaoMonitor>(() => lerVisao(email));
  const setVisao = (v: VisaoMonitor) => { if (!v.cards && !v.tabela) return; setVisaoRaw(v); salvarVisao(email, v); };
  // Botão "Tela cheia" do mapa: expande só o mapa (fixed por cima de tudo + tela cheia do navegador), não a tela.
  // Fullscreen API só no elemento do mapa esconderia os modais e toasts, que vão por portal para o body.
  const [mapaCheio, setMapaCheio] = useState(false);
  // a lista de veículos vem junto no mapa em tela cheia; o botão "Lista" sobre o mapa esconde e mostra de novo
  const [listaNoMapa, setListaNoMapa] = useState(true);
  const nativo = useRef(false);
  const pedirNativo = () => { if (document.fullscreenElement) return; const p = document.documentElement.requestFullscreen?.(); if (p) { nativo.current = true; p.catch(() => { nativo.current = false; }); } };
  const sairNativo = () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); nativo.current = false; };
  const sairTelaCheia = () => { setFull(false); setMapaCheio(false); sairNativo(); };
  const entrarMapaCheio = () => { setMapaCheio(true); setListaNoMapa(true); pedirNativo(); };
  const sairMapaCheio = () => { setMapaCheio(false); if (!full) sairNativo(); };
  useScrollLock(full || mapaCheio);
  // Desktop: lista e mapa ocupam a altura livre da janela abaixo do topo deles, sem rolar a página no zoom de 100%
  // (lib/alturaLivre). Fora da tela cheia, que já ocupa a janela inteira.
  const linhaRef = useRef<HTMLDivElement>(null);
  const alturaMapa = useAlturaLivre(linhaRef, { ativo: !full && assets.length > 0 });
  useEffect(() => {
    // Esc na tela cheia do navegador é consumido por ele: o fim da tela cheia nativa encerra o modo da tela junto
    const f = () => { if (!document.fullscreenElement && nativo.current) { nativo.current = false; setFull(false); setMapaCheio(false); } };
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  // cliente só de monitoramento (Setup: monitoramento.abrir_tela_cheia) já abre em tela cheia
  useEffect(() => { lerParametro('monitoramento.abrir_tela_cheia').then((v) => { if (Number(v) === 1) setFull(true); }).catch(() => { /* sem o parâmetro, abre normal */ }); }, []);
  useEffect(() => { const id = sp.get('ativo'); if (id) setSel(id); }, [sp]); // busca (⌘K) pode trocar o veículo sem remontar a tela

  const list = [
    ...assets.map((a: any) => { const v = vehicles[a.id]; return { a, v, s: vehicleStatus(v, agora), k: kindOf(a.id, v), d: drivers.find((d: any) => d.id === a.driverId) }; }),
  ];
  const [limit, setLimit] = useState(BATCH);
  useEffect(() => setLimit(BATCH), [q, st, grp]);
  const recorte = list.filter((x: any) => (!grp || x.a.groupIds?.includes(grp)) && (!q || (x.a.name + x.a.plate + (x.d?.name || '') + x.a.model).toLowerCase().includes(q.toLowerCase())));
  const shown = recorte.filter((x: any) => st === 'todos' || x.s.key === st);
  const cur = list.find((x: any) => x.a.id === sel);
  // os KPIs contam o veículo aberto no painel ou, sem ele, o recorte da busca e do grupo; o filtro de status não entra,
  // senão clicar num card zerava os outros
  const contados = cur ? [cur] : recorte;
  const counts = contarStatusFrota(contados.map((x: any) => x.v), agora);
  // o mapa mostra o mesmo recorte da lista (status do card, grupo e busca); o veículo aberto no painel fica mesmo fora dele
  const noMapa = shown.filter((x: any) => x.v).concat(cur?.v && !shown.includes(cur) ? [cur] : []);
  // painéis sobre o mapa: na saída mostram o último conteúdo enquanto deslizam para fora
  const vp = usePresence(!!(cur && !pass)), pp = usePresence(!!pass);
  const lastCur = useRef<any>(null), lastPass = useRef<any>(null);
  if (cur && !pass) lastCur.current = cur;
  if (pass) lastPass.current = pass;
  const lastUpd = Math.max(0, ...list.filter((x: any) => x.v && !x.v.noSignal).map((x: any) => x.v.lastUpdate));
  const alerts = useStore((s) => s.alerts);
  // os mesmos do card "Em movimento" (vehicleStatus): com outro corte de velocidade, a velocidade média dizia "de 6 em
  // movimento" ao lado de um card com 5
  const moving = contados.filter((x: any) => x.s.key === 'mov');
  // km de hoje: só o resumo de uso da API (dia inteiro, o mesmo da tela inicial), por veículo e somado. O histórico do
  // navegador só guarda os últimos LIVE_HISTORY pontos de cada veículo desde que a página abriu — somado, dava bem menos que
  // o real (12/11/2026, HML: 15 km aqui × 190 km no Início). Sem o resumo (carregando ou erro) a tela mostra "—", nunca a
  // conta do navegador.
  const { dados: resumoUso } = useResumoUso();
  const kmHojePorAtivo = useMemo(() => {
    const hoje = resumoUso?.dias[resumoUso.dias.length - 1];
    if (!hoje) return null;
    const m = new Map<string, number>();
    for (const u of resumoUso!.uso) if (u.dia === hoje) m.set(u.assetId, u.km);
    return m;
  }, [resumoUso]);
  const kmHoje = kmHojePorAtivo ? contados.reduce((s: number, x: any) => s + (kmHojePorAtivo.get(x.a.id) ?? 0), 0) : null;
  const velMedia = moving.length ? moving.reduce((s: number, x: any) => s + x.v.speed, 0) / moving.length : 0;
  useEffect(() => { const t = setTimeout(() => map?.invalidateSize(), 60); return () => clearTimeout(t); }, [full, mapaCheio, listaNoMapa, mobile, visao.cards, visao.tabela, map]); // o mapa muda de tamanho
  // Esc sai da tela cheia (com o painel do veículo aberto, ele fecha antes: o handler dele marca o evento)
  useEffect(() => {
    if (!full && !mapaCheio) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !sel && !cmd && !document.querySelector('[aria-modal="true"], [role="menu"]')) (mapaCheio ? sairMapaCheio : sairTelaCheia)(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [full, mapaCheio, cmd, sel]);
  const pick = (id: string) => setSel(id);
  const fitAll = (animate = true) => { const pts = noMapa.map((x: any) => x.v.pos); if (map && pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 15, animate }); };
  // Ao abrir a tela (inclusive voltando de outra): enquadra a frota toda uma vez, assim que houver posição. Sem isso o
  // mapa ficava no centro fixo do MapContainer até alguém clicar em "Ver a frota toda". Sem animação: já abre enquadrado.
  const enquadrou = useRef(false);
  const comPosicao = list.filter((x: any) => x.v).length;
  useEffect(() => { if (enquadrou.current || !map || !comPosicao) return; enquadrou.current = true; fitAll(false); }, [map, comPosicao]);
  const clearFilters = () => { setQ(''); setSt('todos'); setGrp(''); };
  const passAt = (lat: number, lng: number, radius: number) => setPass({ lat, lng, radius, from: toInputDT(Date.now() - DAY), to: toInputDT(Date.now()) });

  const listaVeiculos = (
    <ul className="flex-1 min-h-0 overflow-y-auto -mx-2 pb-16" aria-label={`${shown.length} veículos`}>
      {shown.slice(0, Math.max(limit, shown.findIndex((x: any) => x.a.id === sel) + 1)).map(({ a, v, s, k, d }: any) => (
        <li key={a.id}>
          <VehicleListItem silhouette={silhouetteOf(a)} icon={a.icon} photo={a.photo} plate={a.name} kind={k} selected={sel === a.id} onClick={() => pick(a.id)}
            model={[a.brand, a.model].filter(Boolean).join(' ')} driver={d?.name || 'Sem motorista'} pos={v?.pos}
            tracker={v ? { ignition: ignicaoAtual(v), gps: v.gps, gsm: v.gsm, battery: v.battery, blocked: v.blocked, power: v.power, comunicacao: v.comunicacao, em: v.telemetriaEm } : null}
            speed={v && s.key !== 'sem' && !s.semPosicao ? Math.round(v.speed) : null} time={v ? shortDT(v.lastUpdate) : ''}
            menu={[{ icon: 'cadeado', label: 'Bloquear', danger: true, onClick: () => comandar(a.id, 'c_bloq') }, { icon: 'cadeado', label: 'Desbloquear', onClick: () => comandar(a.id, 'c_desb') },
              { icon: 'comando', label: 'Outros comandos', onClick: () => comandar(a.id) }, { icon: 'rota', label: 'Percurso', onClick: () => nav(`/monitoramento/replay?a=${a.id}`) }]} />
        </li>
      ))}
      {shown.length > limit && <MoreOnScroll onMore={() => setLimit((l) => l + BATCH)} />}
      {shown.length === 0 && <li><EmptyState illustration="ilu-busca-veiculo" title="Nenhum veículo com esses filtros" detail="Tente ajustar os filtros ou limpar a pesquisa." action={<Button variant="dark" size="sm" onClick={clearFilters}>Limpar filtros</Button>} /></li>}
    </ul>
  );

  const header = (
    <MonitorHeader title="Monitoramento" subtitle={<>Ao vivo · {list.length} veículos rastreados{lastUpd ? <> · atualizado às <time className="num">{shortDT(lastUpd)}</time></> : null}</>}>
      <Button variant="secondary" className="max-w-full min-w-0" onClick={() => setCmd({ target: 'grupo' })} disabled={!list.length}><Icon name="comando" size={18} className="shrink-0" /><span className="truncate">Comando para grupo</span></Button>
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
    // encaixado, o respiro do fim da página (--page-end, 96px) vira 24px: senão a página ainda rolaria até ele
    <div style={alturaMapa ? { marginBottom: 'calc(var(--sp-6) - var(--page-end))' } : undefined}>
      {header}
      <PageBody>
      <Stack gap="grid">
      <div role={full ? 'dialog' : undefined} aria-label={full ? 'Monitoramento em tela cheia' : undefined}
        className={cx('flex flex-col', full ? 'fixed inset-0 z-[1100] bg-canvas gap-stack p-3' : 'gap-grid')}>
      {full && (
        <div className="flex flex-wrap items-center gap-stack shrink-0">
          <div className="min-w-0 mr-auto">
            <h1 className="sr-only">Monitoramento</h1>
            <p className="text-caption text-ink-2">Ao vivo · {list.length} veículos{lastUpd ? <> · atualizado às <time className="num">{shortDT(lastUpd)}</time></> : null}</p>
          </div>
          <SearchInput className="w-64 max-md:w-full max-md:order-2" value={q} onChange={setQ} placeholder="Buscar placa, motorista ou modelo" aria-label="Buscar veículo" />
          <Select aria-label="Grupo" className="max-md:order-2 max-md:w-full" value={grp} onChange={(e) => setGrp(e.target.value)} options={[{ value: '', label: 'Todos os grupos' }, ...groups.map((g: any) => ({ value: g.id, label: g.name }))]} />
          <div role="group" aria-label="Visão" className="flex gap-tight max-md:hidden">
            <Button variant={visao.cards ? 'dark' : 'secondary'} size="sm" aria-pressed={visao.cards} disabled={visao.cards && !visao.tabela} title={visao.cards && !visao.tabela ? 'Ligue a tabela para poder esconder os cards' : undefined} onClick={() => setVisao({ ...visao, cards: !visao.cards })}><Icon name="ativos" size={16} />Cards</Button>
            <Button variant={visao.tabela ? 'dark' : 'secondary'} size="sm" aria-pressed={visao.tabela} disabled={visao.tabela && !visao.cards} title={visao.tabela && !visao.cards ? 'Ligue os cards para poder esconder a tabela' : undefined} onClick={() => setVisao({ ...visao, tabela: !visao.tabela })}><Icon name="relatorios" size={16} />Tabela</Button>
          </div>
          <Button variant="secondary" size="sm" className="max-md:hidden" onClick={() => setCmd({ target: 'grupo' })}><Icon name="comando" size={16} />Comando para grupo</Button>
          {/* celular: X ao lado do título (o texto inteiro empurrava o botão para a última linha) */}
          <Button variant="secondary" size="sm" className="max-md:order-1 max-md:w-ctl max-md:h-ctl max-md:!px-0" onClick={sairTelaCheia} title="Sair da tela cheia (Esc)" aria-label="Sair da tela cheia"><Icon name="tela-cheia" size={16} className="max-md:hidden" /><Icon name="fechar" size={20} className="md:hidden" /><span className="max-md:hidden">Sair da tela cheia</span></Button>
        </div>
      )}
      {!full && !mobile && <FaixaFrota total={contados.length} counts={counts} st={st} onStatus={(k) => setSt(st === k ? 'todos' : k)} kmHoje={kmHoje} velMedia={velMedia} emMovimento={moving.length} />}
      <div ref={full ? undefined : linhaRef} style={!full && alturaMapa ? { ['--mon-h' as string]: `${alturaMapa}px` } : undefined}
        className={full ? 'flex-1 min-h-0 flex gap-stack' : 'flex flex-wrap items-start gap-grid'}>
        <Card dense className={mapaCheio
          ? cx('fixed inset-y-0 left-0 w-[360px] z-[1100] !rounded-none !shadow-none border-r border-line', !listaNoMapa && 'hidden')
          : full
          ? cx('w-[360px] shrink-0 h-full max-md:hidden', !visao.cards && 'hidden')
          : 'flex-[1_1_340px] md:max-w-[420px] min-h-[360px] md:h-[var(--mon-h,calc(100vh/var(--ui-zoom)-128px))] max-md:hidden'}>
          <section aria-label="Veículos" className="flex flex-col gap-stack h-full min-h-0">
            {(!full || mapaCheio) && <SearchInput value={q} onChange={setQ} placeholder="Buscar placa, motorista ou modelo" aria-label="Buscar veículo" />}
            {(!full || mapaCheio) && <Select aria-label="Grupo" value={grp} onChange={(e) => setGrp(e.target.value)} options={[{ value: '', label: 'Todos os grupos' }, ...groups.map((g: any) => ({ value: g.id, label: g.name }))]} />}
            {listaVeiculos}
          </section>
        </Card>

        <div className={full ? 'flex-1 min-w-0 flex flex-col gap-stack' : 'contents'}>
        <section ref={mapSectionRef} aria-label="Mapa" className={mapaCheio
          ? cx('fixed inset-y-0 right-0 z-[1100] overflow-hidden bg-canvas', listaNoMapa ? 'left-[360px]' : 'left-0')
          : full
          ? 'flex-1 min-h-[240px] relative rounded-card overflow-hidden border border-line'
          : 'flex-[999_1_480px] min-w-0 relative rounded-card overflow-hidden border border-line min-h-[360px] md:h-[var(--mon-h,calc(100vh/var(--ui-zoom)-128px))]'}>
          <MapContainer ref={setMap} center={[-14.2, -51.9]} zoom={4} className="w-full h-full" zoomControl={false}>
            <TileLayer key={`${tileKey}-${mapStyle}`} className={mapStyle === 'satelite' ? 'tiles-satelite' : undefined} url={MAP_STYLES[mapStyle].url} attribution={MAP_STYLES[mapStyle].attribution} keepBuffer={6} updateWhenZooming={false} eventHandlers={{ tileerror: () => setTileErr((n) => n + 1) }} />
            {showF && <FenceShapes fences={fences} />}
            <ClusteredVehicles selected={sel} grouped={grouped} items={noMapa.map(({ a, v, k }: any) => ({ id: a.id, pos: v.pos, kind: k, node: () => <GlideMarker category={glyphOf(a)} position={v.pos} title={`${a.name} · ${STATUS_LABEL[k as StatusKind]}`} plate={a.name} kind={k} heading={v.heading} selected={sel === a.id} onClick={() => setSel(a.id)} onContextMenu={(pt) => { setCtx(null); setVctx({ ...pt, id: a.id }); }} /> }))} />
            {pass && <Circle center={[pass.lat, pass.lng]} radius={pass.radius} pathOptions={{ color: tv('--graphite'), weight: 1.5, dashArray: '5 5', fillColor: tv('--graphite'), fillOpacity: 0.06 }} />}
            <FlyTo pos={cur?.v?.pos} />
            <Ctx onCtx={(p) => { setCtx(p); setVctx(null); }} />
          </MapContainer>

          <div className="absolute top-3 left-3 right-3 z-[400] flex flex-col items-start gap-tight pointer-events-none [&>*]:pointer-events-auto">
          <div className="flex flex-wrap gap-tight">
            {mapaCheio && <MapButton icon="menu" label="Lista" pressed={listaNoMapa} title={listaNoMapa ? 'Ocultar a lista de veículos' : 'Mostrar a lista de veículos'} onClick={() => setListaNoMapa(!listaNoMapa)} />}
            {!mobile && <MapButton icon="cerca" label="Cercas" pressed={showF} onClick={() => setShowF(!showF)} />}
            <MapButton icon="busca" label="Passou por aqui" title="Quem passou pelo ponto no centro do mapa. Para escolher outro ponto: botão direito no computador, toque longo no celular." onClick={() => { const c = map?.getCenter(); if (c) passAt(c.lat, c.lng, 300); }} />
            {!mobile && <MapButton icon="equipe" label="Agrupar" pressed={grouped} title={grouped ? 'Agrupando veículos próximos' : 'Mostrando todos os veículos'} onClick={() => setGrouped(!grouped)} />}
            {/* celular: cercas, agrupar e estilo num menu só ("Camadas"); quatro botões tomavam o topo do mapa */}
            <span ref={styleBtnRef}>
              <MapButton icon="camadas" label={mobile ? 'Camadas' : 'Estilo do mapa'} title={mobile ? 'Cercas, agrupamento e estilo do mapa' : 'Trocar o estilo do mapa'}
                onClick={() => {
                  const r = styleBtnRef.current && rectUi(styleBtnRef.current), sec = mapSectionRef.current && rectUi(mapSectionRef.current);
                  if (r && sec) setStyleMenu(styleMenu ? null : { x: r.left - sec.left, y: r.bottom - sec.top + 6 });
                }} />
            </span>
          </div>
          <div>
            <MapControls items={[
              // também no toque: a pinça é gesto de dois dedos, e quem não consegue fazê-la precisa dos botões (WCAG 2.5.1)
              { icon: 'zoom-mais', label: 'Aproximar', onClick: () => map?.zoomIn() },
              { icon: 'zoom-menos', label: 'Afastar', onClick: () => map?.zoomOut() },
              { icon: 'centralizar', label: 'Ver a frota toda', onClick: () => fitAll() },
              { icon: 'tela-cheia', label: mapaCheio ? 'Sair da tela cheia' : 'Mapa em tela cheia', onClick: mapaCheio ? sairMapaCheio : entrarMapaCheio },
            ]} />
          </div>
          </div>
          {styleMenu && (
            <ContextMenu x={Math.max(8, Math.min(styleMenu.x, (mapSectionRef.current?.clientWidth ?? 600) - 264))} y={styleMenu.y} onClose={() => setStyleMenu(null)} header={mobile ? 'Camadas' : 'Estilo do mapa'}
              items={[
                ...(mobile ? [
                  { label: showF ? 'Ocultar cercas' : 'Mostrar cercas', icon: 'cerca' as const, onClick: () => setShowF(!showF) },
                  { label: grouped ? 'Mostrar todos os veículos' : 'Agrupar veículos próximos', icon: 'equipe' as const, onClick: () => setGrouped(!grouped) },
                ] : []),
                ...(Object.keys(MAP_STYLES) as MapStyleKey[]).map((k) => ({ label: `${mobile ? 'Mapa: ' : ''}${MAP_STYLES[k].label}${k === mapStyle ? ' · em uso' : ''}`, icon: MAP_STYLES[k].icon, onClick: () => setMapStyle(k) })),
              ]} />
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
                  { label: 'Bloquear', icon: 'cadeado', danger: true, onClick: () => comandar(va.a.id, 'c_bloq') },
                  { label: 'Desbloquear', icon: 'cadeado', onClick: () => comandar(va.a.id, 'c_desb') },
                  { label: 'Outros comandos…', icon: 'comando', onClick: () => comandar(va.a.id) },
                  { label: 'Ver detalhes', icon: 'ativos', onClick: () => setSel(va.a.id) },
                  { label: 'Percurso', icon: 'rota', to: `/monitoramento/replay?a=${va.a.id}` },
                ]} />
            );
          })()}
          {vp.mounted && lastCur.current && <VehiclePanel closing={vp.closing} x={lastCur.current} kmToday={kmHojePorAtivo ? kmHojePorAtivo.get(lastCur.current.a.id) ?? 0 : null} reasons={crit.get(lastCur.current.a.id) || []} onClose={() => setSel(null)} onCmd={(defId?: string) => comandar(lastCur.current.a.id, defId)} onShare={() => setShareA(lastCur.current.a)} />}
          {pp.mounted && lastPass.current && <PassPanel closing={pp.closing} pass={lastPass.current} setPass={setPass} />}
        </section>
        {full && visao.tabela && (
          <Card dense className={cx('min-h-0 overflow-y-auto max-md:hidden', visao.cards ? 'h-[40%]' : 'h-[45%]')}>
            <Table minWidth={760} pageSize={200} card={false} align={['left', 'left', 'right', 'left', 'left', 'left', 'left']}
              head={['Veículo', 'Status', 'Velocidade', 'Ignição', 'Motorista', 'Atualizado', 'Endereço']}
              onRow={(i) => pick(shown[i].a.id)} selected={(i) => shown[i]?.a.id === sel}
              emptyState={<EmptyState icon="busca" layout="row" title="Nenhum veículo com esses filtros" action={<Button variant="dark" size="sm" onClick={clearFilters}>Limpar filtros</Button>} />}
              rows={shown.map(({ a, v, s, k, d }: any) => [
                <AssetName name={a.name} />, <StatusDot kind={k} label={k === 'crit' ? STATUS_LABEL.crit : s.label} />,
                <span className="num">{v && s.key !== 'sem' && !s.semPosicao ? `${Math.round(v.speed)} km/h` : '—'}</span>,
                v ? (ignicaoAtual(v) == null ? <span className="text-ink-2">Não informada</span> : ignicaoAtual(v) ? <span className="text-ok">Ligada</span> : <span className="text-ink-2">Desligada</span>) : '—',
                d?.name || <span className="text-ink-2">Sem motorista</span>,
                v ? <time className="num">{shortDT(v.lastUpdate)}</time> : '—',
                v?.pos ? <Address pos={v.pos} className="text-small" /> : '—',
              ])} />
          </Card>
        )}
        </div>
      </div>
      </div>
      </Stack>
      </PageBody>
      <CommandModal state={cmd} onClose={() => setCmd(null)} />
      <ShareModal asset={shareA} onClose={() => setShareA(null)} />
    </div>
  );
}

// Faixa de KPIs acima do mapa e da lista (transformado de painel lateral em 07/11/2026, pedido do usuário).
// Total + os status filtram a lista e o mapa (clicar de novo volta para todos); percurso e velocidade só informam.
// "Parado" (rastreador sem ignição informada, 12/11/2026) só aparece quando há veículo nele.
const STATUS_FROTA: { k: StatusFrota; kind: StatusKind; label: string }[] = [
  { k: 'mov', kind: 'mov', label: 'Em movimento' },
  { k: 'par', kind: 'parado', label: 'Parado ligado' },
  { k: 'des', kind: 'off', label: 'Ignição desligada' },
  { k: 'pnd', kind: 'stop', label: 'Parado' },
  { k: 'sem', kind: 'nosignal', label: 'Sem sinal' },
];

function StatusKpi({ s, count, pct, active, onClick }: { s: typeof STATUS_FROTA[number]; count: number; pct: number; active: boolean; onClick: () => void }) {
  return (
    <Tooltip content={active ? 'Mostrar todos na lista e no mapa' : `Filtrar lista e mapa: ${s.label.toLowerCase()}`}>
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cx('text-left bg-card rounded-card p-card-sm flex flex-col min-w-0 [container-type:inline-size] border transition-colors',
        active ? 'border-brand-fill ring-1 ring-inset ring-brand-fill' : 'border-transparent shadow-card hover:bg-card-2')}>
      <StatusDot kind={s.kind} label={s.label} />
      <div className="flex items-baseline gap-tight mt-kpi-title">
        <Num value={count} size="kpi" count />
        <span className="num text-small text-ink-3">{pct}%</span>
      </div>
    </button>
    </Tooltip>
  );
}

function FaixaFrota({ total, counts, st, onStatus, kmHoje, velMedia, emMovimento }: {
  total: number; counts: Record<StatusFrota, number>; st: string; onStatus: (k: string) => void;
  kmHoje: number | null; velMedia: number; emMovimento: number;
}) {
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const status = STATUS_FROTA.filter((s) => s.k !== 'pnd' || counts.pnd > 0 || st === 'pnd');
  return (
    <section aria-label="KPIs da frota" className={cx('grid grid-cols-2 sm:grid-cols-3 gap-grid', status.length > 4 ? 'lg:grid-cols-8' : 'lg:grid-cols-7')}>
      <KpiTile label="Frota" value={total} digits={0} sub="rastreados" />
      {status.map((s) => <StatusKpi key={s.k} s={s} count={counts[s.k]} pct={pct(counts[s.k])} active={st === s.k} onClick={() => onStatus(s.k)} />)}
      <KpiTile label="Percurso hoje" value={kmHoje} unit="km" digits={0} sub="soma da frota" />
      <KpiTile label="Velocidade média" value={emMovimento ? velMedia : null} unit="km/h" digits={0} sub={emMovimento ? `de ${emMovimento} em movimento` : 'nenhum em movimento'} />
    </section>
  );
}

// Painel do veículo selecionado: status, silhueta (ou foto), placa, métricas do dia, sensores e ações.
const RUIM: Record<string, string> = { recusado: 'Recusado pelo rastreador', falhou: 'Falhou no envio', expirado: 'Sem confirmação no prazo', cancelado: 'Substituído por outro comando', nao_suportado: 'Não disponível para este rastreador' };

// o aparelho (ou a leitura do protocolo) não traz o dado: nunca mostrar um valor de exemplo no lugar
const NAO_INFORMADO = <span className="text-ink-2">Não informado</span>;
// leitura antiga (o rastreador continua no último valor conhecido, mas o dado não chega há tempo): mostra a idade
const Idade = ({ em }: { em: string | null | undefined }) => { const a = leituraAntiga(em); return a ? <span className="text-ink-2"> · lido {a}</span> : null; };

// kmToday: do resumo de uso da API (null = ainda não chegou ou falhou → "—"); a soma do histórico do navegador só via os
// pontos desde que a página abriu e mostrava bem menos que o real.
function VehiclePanel({ x, kmToday, reasons, onClose, onCmd, onShare, closing }: any) {
  const { a, v, s, k, d } = x;
  const odo = useStore((st) => assetKm(st, a.id));
  const fences = useStore((st) => st.fences.filter((f: any) => v?.inside?.includes(f.id)));
  const setPhoto = (data: string) => { useStore.getState().upsert('assets', { id: a.id, photo: data }); toast('Foto do veículo atualizada.'); };
  const hours = a.meter === 'horimetro';
  const daApi = a.id.startsWith('lc_'); // veículo da nossa API (localleMap.assetIdFor)
  const ign = ignicaoAtual(v); // a do último pacote quando mais nova que a posição (pacote sem GPS)
  const velPainel = velocidadePainelAtual(v);
  const mobile = useIsMobile();
  const nav = useNavigate();
  const bloqueio = v?.blocked
    ? <Button size={mobile ? 'md' : 'sm'} className={cx(mobile && 'flex-1')} onClick={() => onCmd('c_desb')}><Icon name="cadeado" size={16} />Desbloquear</Button>
    : <Button variant="danger" size={mobile ? 'md' : 'sm'} className={cx(mobile && 'flex-1')} onClick={() => onCmd('c_bloq')}><Icon name="cadeado" size={16} />Bloquear</Button>;
  return (
    <FloatingPanel label={`Detalhe de ${a.name}`} closing={closing} onClose={onClose}
      header={<StatusLine kind={k} label={k === 'crit' ? STATUS_LABEL.crit : s.label} sub={[v && s.key !== 'sem' && !s.semPosicao ? `${Math.round(v.speed || 0)} km/h` : null, fences.length ? `em ${fences.map((f: any) => f.name).join(', ')}` : null].filter(Boolean).join(' · ') || undefined} />}
      // celular: só o que se faz na rua cabe na linha (comandos e bloqueio); o resto vai para o menu e a foto para o corpo.
      // Seis botões quebravam em três linhas e o painel ficava sem espaço para o próprio conteúdo.
      footer={mobile ? <>
        <Button variant="secondary" className="flex-1" onClick={() => onCmd()}><Icon name="comando" size={16} />Comandos</Button>
        {bloqueio}
        <Menu label="Mais ações do veículo" items={[
          { label: 'Percurso', icon: 'rota', onClick: () => nav(`/monitoramento/replay?a=${a.id}`) },
          { label: 'Compartilhar localização', icon: 'compartilhar', onClick: onShare },
        ]} trigger={({ ref, open, toggle }) => <button ref={ref} type="button" aria-label="Mais ações do veículo" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className={cx(buttonClass('secondary'), '!px-0 w-ctl')}><Icon name="mais-opcoes" size={20} /></button>} />
      </> : <>
        {/* desktop: Percurso/foto/Compartilhar são atalhos secundários (só ícone, com título) à esquerda;
            Comandos e Bloquear são a ação principal do painel e ficam agrupados à direita. */}
        <Link to={`/monitoramento/replay?a=${a.id}`} title="Percurso" className={cx(buttonClass('secondary', 'sm'), '!px-0 w-ctl-sm')}><Icon name="rota" size={16} /></Link>
        <span title={a.photo ? 'Trocar foto' : 'Enviar foto'}>
          <FilePick accept="image/*" onFile={(data) => setPhoto(data)} className={cx(buttonClass('secondary', 'sm'), '!px-0 w-ctl-sm')}><Icon name="camera" size={16} /></FilePick>
        </span>
        <IconButton aria-label="Compartilhar localização" size="sm" onClick={onShare}><Icon name="compartilhar" size={16} /></IconButton>
        <div className="ml-auto flex items-center gap-tight">
          <Button variant="secondary" size="sm" onClick={() => onCmd()}><Icon name="comando" size={16} />Comandos</Button>
          {bloqueio}
        </div>
      </>}>
      {/* foto na altura do bloco de texto (placa + modelo + motorista), cortada no centro dentro da moldura:
          com altura fixa ela ficava menor que o texto e desalinhada */}
      <div className="flex items-stretch gap-grid">
        <div className="relative w-28 min-h-[72px] shrink-0 rounded-ctl overflow-hidden bg-surface-muted grid place-items-center">
          {a.photo ? <AssetThumb asset={a} className="absolute inset-0 w-full h-full object-center" /> : <AssetThumb asset={a} className="w-20 h-12" />}
        </div>
        <div className="min-w-0 flex flex-col justify-center gap-hair">
          <Plate name={a.name} size="lg" className="mb-hair self-start" />
          {a.plate && a.apelido && <p className="text-small font-medium truncate">{a.apelido}</p>}
          <p className="text-small text-ink-2 truncate">{a.brand} {a.model} <span className="text-ink-2 num">{String(a.year || '').slice(0, 4)}</span></p>
          <p className="text-small text-ink-2 truncate">{d?.name || 'Sem motorista'}</p>
          {mobile && <FilePick accept="image/*" onFile={(data) => setPhoto(data)} className="self-start text-small font-medium link-brand"><span className="inline-flex items-center gap-icon"><Icon name="camera" size={16} />{a.photo ? 'Trocar foto' : 'Enviar foto'}</span></FilePick>}
        </div>
      </div>
      <Pendencias assetId={a.id} reasons={reasons} />
      <div className="grid grid-cols-2 gap-grid mt-card-foot pt-card-foot border-t border-line">
        <div className="flex flex-col gap-hair"><p className="text-caption text-ink-2">Velocidade</p>{!v || s.key === 'sem' || s.semPosicao ? <Num value={null} size="lg" className="block text-ink-3" /> : <Num value={Math.round(v?.speed || 0)} unit="km/h" size="lg" />}
          {/* a do GPS é a principal; a do painel (CAN) só aparece quando veio no mesmo pacote da posição */}
          {s.key !== 'sem' && !s.semPosicao && velPainel !== null && <p className="text-caption text-ink-2">Painel: <span className="num">{Math.round(velPainel)} km/h</span></p>}</div>
        <div className="flex flex-col gap-hair"><p className="text-caption text-ink-2">Rodou hoje</p><Num value={kmToday} unit="km" digits={1} size="lg" /></div>
      </div>
      <DescList className="mt-card-head">
        {v?.noSignal ? <>
          <DescRow label="Comunicação"><StatusDot kind="nosignal" label={s.label} /></DescRow>
          <DescRow label="Última posição"><time className="num">{fmtDT(v.lastUpdate)}</time></DescRow>
          {/* aparelho calado com o fio cortado antes: é o retrato do furto, então o último estado conhecido continua na tela */}
          {v.power === false && <DescRow label="Alimentação"><StatusDot kind="crit" label="Cortada antes de perder o sinal" /><Idade em={v.telemetriaEm?.alimentacaoExterna} /></DescRow>}
        </> : <>
          <DescRow label="Ignição">{ign == null ? <span className="text-ink-2">Não informada</span> : <StatusDot kind={ign ? 'mov' : 'off'} label={ign ? 'Ligada' : 'Desligada'} />}</DescRow>
          <DescRow label="Alimentação">{v?.power == null ? NAO_INFORMADO : <>{v.power ? 'Ligada' : <StatusDot kind="crit" label="Cortada · na bateria interna" />}<Idade em={v.telemetriaEm?.alimentacaoExterna} /></>}</DescRow>
          <DescRow label="Bateria">{v?.battery == null ? NAO_INFORMADO : <>{v.battery < BATTERY_LOW_V && !leituraAntiga(v.telemetriaEm?.tensaoV) ? <StatusDot kind="crit" label={`${num(v.battery, 1)} V · baixa`} /> : `${num(v.battery, 1)} V`}<Idade em={v.telemetriaEm?.tensaoV} /></>}</DescRow>
          <DescRow label="GPS">{v?.gps == null ? NAO_INFORMADO : <>{v.gps} satélites<Idade em={v.telemetriaEm?.satelites} /></>}</DescRow>
          <DescRow label="Bloqueio">{v?.blocked == null ? NAO_INFORMADO : <>{v.blocked ? <StatusDot kind="crit" label="Bloqueado" /> : 'Livre'}<Idade em={v.telemetriaEm?.bloqueado} /></>}</DescRow>
          {v?.temp !== undefined && <DescRow label="Temperatura">{a.kind === 'veiculo' && v.temp > -12 ? <StatusDot kind="crit" label={`${num(v.temp, 1)} °C`} /> : `${num(v.temp, 1)} °C`}</DescRow>}
          {v?.door && <DescRow label="Porta do baú">{v.door === 'Aberta' ? <StatusDot kind="parado" label="Aberta" /> : v.door}</DescRow>}
          {/* km/horas só o que o aparelho manda (decisão do usuário em 12/11/2026): por enquanto, o odômetro do painel (rede CAN),
              o número que o motorista vê. Antes a linha somava o odômetro do rastreador, que a nossa API não preenche — dava 0 km,
              ou o km da instalação parado para sempre. A integração antiga (rastreioApi) traz odômetro e horímetro de verdade. */}
          {hours
            ? <DescRow label="Horímetro">{daApi ? NAO_INFORMADO : <Num value={v?.hourmeter} unit="h" digits={1} size="body" />}</DescRow>
            : <DescRow label={v?.odoPainel != null ? 'Odômetro do painel' : 'Odômetro'}>{v?.odoPainel != null
              ? <><Num value={v.odoPainel} unit="km" size="body" /><Idade em={v.telemetriaEm?.odometroPainel} /></>
              : daApi ? NAO_INFORMADO : <Num value={odo} unit="km" size="body" />}</DescRow>}
          <DescRow label="Sinal GSM">{v?.gsm == null ? NAO_INFORMADO : <><span className="inline-flex items-center gap-icon"><Icon name="sinal" size={16} className="text-ink-2" /><span className="num">{v.gsm}/5</span></span><Idade em={v.telemetriaEm?.sinalGsm} /></>}</DescRow>
          <DescRow label="Atualizado"><time className="num">{shortDT(v?.lastUpdate)}</time></DescRow>
        </>}
        <DescRow label="Endereço"><Address pos={v?.pos} className="text-small" /></DescRow>
        <DescRow label="Posição"><span className="num text-caption text-ink-2">{v?.pos?.[0].toFixed(5)}, {v?.pos?.[1].toFixed(5)}</span></DescRow>
      </DescList>
      {v?.pos && <AbrirNoGoogle pos={v.pos} />}
    </FloatingPanel>
  );
}

// posição atual no Google Maps (pino) e no Street View (panorama mais próximo do ponto), em outra aba;
// o cartão do Monitoramento no celular (MonitoramentoGlobo) usa os mesmos endereços
export const linksGoogle = (pos: [number, number]) => {
  const ll = `${pos[0]},${pos[1]}`;
  return [
    { href: `https://www.google.com/maps/search/?api=1&query=${ll}`, icon: 'local' as const, label: 'Abrir no Google Maps', curto: 'Google Maps' },
    { href: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}`, icon: 'street-view' as const, label: 'Abrir no Street View', curto: 'Street View' },
  ];
};
function AbrirNoGoogle({ pos }: { pos: [number, number] }) {
  const links = linksGoogle(pos);
  return (
    <div className="grid grid-cols-2 gap-tight mt-card-head">
      {links.map((l) => (
        <a key={l.icon} href={l.href} target="_blank" rel="noreferrer" className={cx(buttonClass('secondary', 'sm'), 'min-w-0')}>
          <Icon name={l.icon} size={16} className="shrink-0" /><span className="truncate">{l.label}</span>
        </a>
      ))}
    </div>
  );
}

// link temporário só com a posição atual (lib/shares); lista os links do veículo para revogar
export function ShareModal({ asset, onClose }: { asset: any; onClose: () => void }) {
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
              if (!(await confirmAction({ title: 'Desativar este link?', detail: `${x.to ? `${x.to} perde` : 'Quem tem o link perde'} o acesso à localização na hora. Para compartilhar de novo, gere outro link.`, confirmLabel: 'Desativar' }))) return;
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
  const assets = useStore(useShallow((s) => s.assets.filter((a: any) => a.tracker)));
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
  // rastreador do nosso backend: o Traccar diz o que o aparelho aceita e se está conectado (comandos.service.ts).
  // O texto de sintaxe (RELAY,1#…) não é o que vai para ele — quem codifica é o Traccar —, por isso não aparece.
  const real = target === 'veiculo' && assets.find((a: any) => a.id === assetId)?.tracker?.source === 'localle';
  const [cap, setCap] = useState<{ tipos: string[]; online: boolean | null } | null>(null);
  useEffect(() => {
    setCap(null);
    if (!real || !state) return;
    let vivo = true;
    capacidadesComando(assetId).then((c) => vivo && setCap(c)).catch(() => { /* sem a consulta, a API ainda recusa no envio */ });
    return () => { vivo = false; };
  }, [assetId, real, state]);
  const indisponivel = (d: any) => {
    if (!real || !cap) return null;
    const t = tipoComandoLocalle(d.kind, d.payload);
    if (!t || !cap.tipos.includes(t)) return 'Este rastreador não aceita este comando';
    if ((t === 'engineStop' || t === 'engineResume') && !cap.online) return 'Rastreador offline: só com o aparelho conectado';
    return null;
  };
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
    <Modal open={!!state} onClose={onClose} title="Enviar comando" width="max-w-3xl" guardDiscard={false}>
      <div className="flex flex-wrap gap-stack items-center">
        <Tabs value={target} onChange={(k) => setTarget(k as any)} tabs={[{ key: 'veiculo', label: 'Veículo' }, { key: 'grupo', label: 'Grupo de veículos' }]} />
        {target === 'veiculo' ? <SearchSelect aria-label="Veículo" className="w-56 max-md:w-full" value={assetId} onChange={setAssetId} options={assets.map((a: any) => ({ value: a.id, label: a.name }))} />
          : <Select aria-label="Grupo" className="w-64 max-md:w-full" value={groupId} onChange={(e) => setGroupId(e.target.value)} options={groups.map((g: any) => ({ value: g.id, label: `${g.name} (${assets.filter((a: any) => a.groupIds?.includes(g.id)).length})` }))} />}
      </div>
      <div role="radiogroup" aria-label="Comando" className="grid grid-cols-2 md:grid-cols-3 gap-tight">
        {[...defs, ...(tecnico && !real ? [{ id: 'livre', name: 'Comando livre', desc: 'Texto direto ao equipamento' }] : [])].map((d: any) => (
          <ChoiceCard key={d.id} checked={defId === d.id} onSelect={() => setDefId(d.id)} title={d.name} description={indisponivel(d) || d.desc} meta={tecnico && !real ? d.payload : undefined} tone={d.kind === 'bloqueio' ? 'danger' : undefined} disabled={!!indisponivel(d)} />
        ))}
      </div>
      {tecnico && defId === 'livre' && <Field label="Comando livre (sintaxe do rastreador)"><Textarea rows={2} className="font-mono" placeholder="Ex.: RELAY,1#" value={free} onChange={(e) => setFree(e.target.value)} /></Field>}
      {def?.kind === 'alerta' && <Field label="Mensagem exibida no teclado / app do motorista"><Input value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>}
      <div className="flex flex-wrap gap-field items-end">
        <Field label="Confirme com sua senha" className="flex-1 min-w-[200px]"><Input type="password" value={pwd} invalid={!!err} onChange={(e) => setPwd(e.target.value)} placeholder="Sua senha de acesso" /></Field>
        <Button variant={def?.kind === 'bloqueio' ? 'danger' : 'primary'} onClick={send} disabled={!ids.length || !def || !!indisponivel(def)}><Icon name="enviar" size={18} />Enviar {def?.name?.toLowerCase()} para {ids.length} {ids.length === 1 ? 'veículo' : 'veículos'}</Button>
      </div>
      {err && <Callout tone="crit">{err}</Callout>}
      <div className="border-t border-line pt-card-foot mt-tight">
        <h3 className="text-body font-semibold mb-tight">Últimos comandos</h3>
        {commands.length === 0 ? <EmptyState icon="comando" title="Nenhum comando enviado" detail="Os comandos aparecem aqui com a confirmação do rastreador." />
          : <Table minWidth={560} head={['Quando', 'Comando', 'Destino', 'Status']} rows={commands.slice(0, 6).map((c: any) => {
            const vals = Object.values(c.status) as string[]; const ok = vals.filter((x) => x === 'confirmado').length; const pend = vals.filter((x) => x === 'pendente').length;
            // respondido: o aparelho respondeu, mas o bloqueio só confirma quando o estado dele mudar (comandos.service.ts)
            const resp = vals.filter((x) => x === 'respondido').length; const ruim = vals.find((x) => RUIM[x]);
            return [<time className="num">{fmtDT(c.ts)}</time>, c.name + (c.message ? ` · "${c.message}"` : ''), c.target === 'grupo' ? `${c.assetIds.length} veículos` : <AssetName name={name(c.assetIds[0])} />, <Badge tone={ok === vals.length ? 'green' : ruim ? 'red' : 'orange'}>{ok === vals.length ? 'Confirmado pelo rastreador' : ruim ? RUIM[ruim] : resp ? 'Respondeu; aguardando o estado do bloqueio' : pend ? `${pend} aguardando o rastreador` : `${ok}/${vals.length} confirmados`}</Badge>];
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
