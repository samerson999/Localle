// Monitoramento do celular no molde da tela de mapa da Revolut (docs/pesquisa-ux/03-dashboards-tema-motion-revolut.md
// § 3.2–3.3, pedidos do usuário em 11/11/2026). Ocupa a tela inteira por cima do Layout (sem barra inferior nem barra do topo),
// só com o voltar, que leva à Home (/inicio). Monitoramento.tsx o carrega abaixo de md; o desktop segue no mapa Leaflet.
//
// Mapa: MapLibre GL com projeção de globo e dados do OSM em vetor (OpenFreeMap, sem chave). Afastado é o globo; aproximando,
// vira o mapa de ruas (o MapLibre faz a transição sozinho). Região em destaque = os estados onde a frota está (malha do IBGE).
// Arrastar gira o globo e para ao soltar, sem inércia (o que medimos na Revolut). Só o selecionado ganha halo.
//
// Tema: na Revolut o mapa é sempre escuro (doc 03 § 4.2); aqui ele segue o modo escolhido, pedido do usuário. O modo claro
// é o mesmo desenho com os papéis invertidos (o que a Revolut faz no resto do app, § 4.2): terra clara, oceano branco,
// destaque escuro. O seletor Claro/Escuro/Automático desta tela é o mesmo tema do app (lib/tema.ts, também em Minha conta):
// trocar aqui troca o app inteiro.
//
// Folha: não encosta nas bordas, três paradas (baixa = contadores; meio = mapa e lista; alta = lista), arrastar ou tocar
// a alça troca. Contadores filtram a lista; tocar num veículo voa até ele e recolhe a folha com o cartão do veículo, que
// já traz as ações do rastreador (bloquear/desbloquear, comandos, compartilhar) com os mesmos diálogos do Monitoramento.
//
// Dados do store, sincronizado pelo Layout.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useShallow } from 'zustand/react/shallow';
import { useStore, useAgora, vehicleStatus } from '../lib/store';
import { useCriticalMap } from '../lib/critical';
import { PALETA, useTema, type Kind, type Modo, type Paleta } from '../lib/aparencia';
import { cx, useScrollLock, Sheet, type SheetDetent } from '../components/ui';
import { Icon, type IconName } from '../components/icons';
import { CommandModal, ShareModal, linksGoogle } from './Monitoramento';
import { shortDT, isPlate } from '@localle/shared/utils';
import { Plate } from '../components/story';
import { useCountUp } from '../lib/motion';

// Peso do carregamento (medido em 11/11/2026): cada bloco vetorial do OpenMapTiles no zoom do globo tem ~1,3 MB (o mundo
// inteiro em vetor), e o globo pedia vários — segundos de tela vazia, com ou sem cache. Por isso, abaixo de Z_VETOR o mapa não
// usa o vetor: no claro, o relevo do Natural Earth do próprio estilo (~75 KB por bloco); no escuro, o contorno dos continentes
// (Natural Earth 1:110m, domínio público) servido pelo app. A malha das UFs (IBGE, qualidade mínima) também é arquivo do app,
// em vez de uma chamada à API do IBGE a cada abertura. Os dois foram reduzidos (sem atributos, coordenadas com 3 casas).
const Z_VETOR = 5;
const MALHA_UF = `${import.meta.env.BASE_URL}geo/br-uf.json`;
const CONTINENTES = `${import.meta.env.BASE_URL}geo/continentes.json`;

// parado sem ignição informada (pnd) usa a cor do desligado no globo; o contador do celular não mostra nenhum dos dois
const KIND_DE: Record<string, Kind> = { mov: 'mov', par: 'parado', des: 'off', pnd: 'off', sem: 'nosignal' };
const CONTADORES: { k: 'mov' | 'par' | 'sem'; label: string }[] = [{ k: 'mov', label: 'Em movimento' }, { k: 'par', label: 'Parados ligados' }, { k: 'sem', label: 'Sem sinal' }];

type Item = { id: string; plate: string; model: string; driver: string; pos?: [number, number]; key: string; kind: Kind; label: string; speed: number | null; ts?: number; blocked: boolean; asset: any };

// raio do globo em px no zoom z é 512·2^z/(2π); escolhe o zoom em que ele ocupa ~92% do menor lado da área livre
const zoomDoGlobo = (w: number, h: number) => Math.log2((Math.max(120, Math.min(w, h)) * 0.92 * Math.PI) / 512);

let malhaCache: Promise<any> | null = null;
const malhaUF = () => (malhaCache ??= fetch(MALHA_UF).then((r) => { if (!r.ok) throw new Error(`malha das UFs: ${r.status}`); return r.json(); }).catch((e) => { malhaCache = null; throw e; }));

// ponto dentro de polígono (raio), para achar os estados onde há veículo
function dentro([x, y]: [number, number], anel: number[][]) {
  let ok = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}
function contem(geom: any, p: [number, number]) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some((poly: number[][][]) => dentro(p, poly[0]) && !poly.slice(1).some((furo) => dentro(p, furo)));
}

export default function MonitoramentoGlobo() {
  const nav = useNavigate();
  const assets = useStore(useShallow((s) => s.assets.filter((a: any) => a.tracker)));
  const vehicles = useStore((s) => s.vehicles);
  const drivers = useStore((s) => s.drivers);
  const crit = useCriticalMap();
  const { modo, setModo, tema } = useTema();
  const P = PALETA[tema];
  const [sel, setSel] = useState<string | null>(null);
  const [st, setSt] = useState<'' | 'mov' | 'par' | 'sem'>('');
  const [q, setQ] = useState('');
  const [parada, setParada] = useState<Parada>('meio');
  const [aparencia, setAparencia] = useState(false);
  const aparenciaBtn = useRef<HTMLDivElement>(null);
  const [cmd, setCmd] = useState<null | { target: 'veiculo' | 'grupo'; assetId?: string; defId?: string }>(null);
  const [share, setShare] = useState<any>(null);

  const agora = useAgora(); // o status vence com o tempo (posição recente): re-renderiza mesmo sem posição nova
  const itens: Item[] = useMemo(() => assets.map((a: any) => {
    const v = vehicles[a.id], s = vehicleStatus(v, agora);
    return {
      id: a.id, plate: a.name, model: [a.brand, a.model].filter(Boolean).join(' '), driver: drivers.find((d: any) => d.id === a.driverId)?.name || 'Sem motorista',
      pos: v?.pos, key: s.key, kind: crit.has(a.id) ? 'crit' : KIND_DE[s.key] || 'off', label: crit.has(a.id) ? 'Crítico' : s.label, speed: v && s.key !== 'sem' ? Math.round(v.speed || 0) : null, ts: v?.lastUpdate,
      blocked: !!v?.blocked, asset: a,
    };
  }), [assets, vehicles, drivers, crit, agora]);
  const contagem = useMemo(() => { const c = { mov: 0, par: 0, des: 0, pnd: 0, sem: 0 } as Record<string, number>; for (const i of itens) c[i.key]++; return c; }, [itens]);
  const lista = itens.filter((i) => (!st || i.key === st) && (!q || (i.plate + i.model + i.driver).toLowerCase().includes(q.toLowerCase())));
  const atual = itens.find((i) => i.id === sel);
  const ultima = Math.max(0, ...itens.filter((i) => i.speed !== null && i.ts).map((i) => i.ts as number));

  // o globo mostra o mesmo recorte da lista (contador e busca); o veículo aberto fica mesmo fora dele
  const noMapa = useMemo(() => itens.filter((i) => i.id === sel || ((!st || i.key === st) && (!q || (i.plate + i.model + i.driver).toLowerCase().includes(q.toLowerCase())))), [itens, st, q, sel]);
  const { box: mapaBox, map, pronto } = useGlobo(noMapa, sel, (id) => { setSel(id); if (id) setParada('baixa'); }, P);
  const alturaFolha = useRef(0);
  const [visivel, setVisivel] = useState(0); // quanto da folha aparece (px): o mapa centraliza no que sobra acima dela
  const TOPO = 64; // barra do topo flutuante

  // o centro do mapa é o meio da área livre (entre a barra do topo e a folha), não o meio da tela; afastado (globo), o zoom
  // também se ajusta para o globo caber inteiro nessa área. Acompanha a folha quando ela muda de parada.
  // Durante um voo (tocar num veículo recolhe a folha no mesmo gesto), o ajuste espera o fim: um easeTo agora cortaria o voo.
  const padPendente = useRef<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const ajustar = (m: maplibregl.Map, padding: { top: number; bottom: number; left: number; right: number }) => {
    const el = m.getContainer();
    if (m.getZoom() < 4) m.easeTo({ padding, zoom: zoomDoGlobo(el.clientWidth, el.clientHeight - padding.bottom - padding.top), duration: 300 });
    else m.easeTo({ padding, duration: 300 });
  };
  useEffect(() => {
    const m = map.current; if (!m || !pronto || !visivel) return;
    const padding = { top: TOPO, bottom: visivel, left: 0, right: 0 };
    if (m.isMoving()) padPendente.current = padding;
    else ajustar(m, padding);
  }, [visivel, pronto]);
  useEffect(() => {
    const m = map.current; if (!m || !pronto) return;
    const fim = () => { const p = padPendente.current; if (p) { padPendente.current = null; ajustar(m, p); } };
    m.on('moveend', fim);
    return () => { m.off('moveend', fim); };
  }, [pronto]);

  // tocar na lista: voa até o veículo e recolhe a folha para o mapa aparecer
  const escolher = (id: string) => {
    setSel(id);
    setParada('baixa');
    const it = itens.find((i) => i.id === id);
    if (map.current && it?.pos) map.current.flyTo({ center: [it.pos[1], it.pos[0]], zoom: 15, duration: 1600, essential: true });
  };
  const verGlobo = () => {
    const m = map.current; if (!m) return;
    const el = m.getContainer();
    const pts = itens.filter((i) => i.pos);
    const centro: [number, number] = pts.length ? [pts.reduce((s, i) => s + i.pos![1], 0) / pts.length, pts.reduce((s, i) => s + i.pos![0], 0) / pts.length] : [-50, -14];
    m.flyTo({ center: centro, zoom: zoomDoGlobo(el.clientWidth, el.clientHeight - alturaFolha.current - TOPO), duration: 1600 });
  };
  const verFrota = () => {
    const m = map.current; const pts = noMapa.filter((i) => i.pos).map((i) => [i.pos![1], i.pos![0]] as [number, number]);
    if (!m || !pts.length) return;
    const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    // o padding do mapa (barra do topo e folha) já entra na conta; este é só o respiro em volta da frota
    m.fitBounds(b, { padding: 40, maxZoom: 14, duration: 1600 });
  };

  useScrollLock(true); // a página de trás (Layout) não rola por baixo do mapa

  return (
    <div role="region" aria-label="Monitoramento" className="fixed inset-0 z-[1055] overflow-hidden transition-colors duration-300" style={{ background: P.espaco, color: P.texto }}>
      {/* o contêiner do mapa fica dentro de um absoluto: o CSS do MapLibre (.maplibregl-map { position: relative }) carrega
          depois do Tailwind e anulava o "absolute inset-0" do próprio contêiner — o mapa ficava com altura zero (tela preta) */}
      <div className="absolute inset-0"><div ref={mapaBox} className="w-full h-full" aria-label="Mapa da frota" role="region" /></div>
      {!pronto && <p className="absolute inset-x-0 top-1/3 text-center text-small" style={{ color: P.texto2 }}>Carregando o mapa…</p>}

      {/* barra do topo flutuante: voltar à esquerda, ações à direita (Revolut: voltar · + · Compartilhar) */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] pointer-events-none [&>*]:pointer-events-auto">
        <Circulo p={P} label="Voltar para o início" icon="voltar" onClick={() => nav('/inicio')} />
        <span className="mr-auto" />
        <div ref={aparenciaBtn}>
          <Circulo p={P} label="Aparência" icon="lua" onClick={() => setAparencia(!aparencia)} expanded={aparencia} />
          {aparencia && <SeletorModo p={P} modo={modo} ancora={aparenciaBtn} onModo={(m) => setModo(m)} onFechar={() => setAparencia(false)} />}
        </div>
        <Circulo p={P} label="Ver o globo" icon="zoom-menos" onClick={verGlobo} />
        <button type="button" onClick={verFrota} className="h-11 px-4 rounded-full flex items-center gap-2 font-medium text-[15px] active:scale-[0.97] transition-transform" style={{ background: P.primario, color: P.primarioTexto }}>
          <Icon name="centralizar" size={18} />Ver a frota
        </button>
      </div>

      <Folha p={P} parada={parada} setParada={setParada} onAltura={(h) => { alturaFolha.current = h; setVisivel(h); }}
        topo={<>
          <div className="grid grid-cols-3 text-center" role="group" aria-label="Filtrar por status">
            {CONTADORES.map((c) => (
              <button key={c.k} type="button" aria-pressed={st === c.k} onClick={() => setSt(st === c.k ? '' : c.k)}
                className="flex flex-col items-center gap-0.5 py-1 rounded-2xl transition-colors" style={{ background: st === c.k ? P.cartao : undefined }}>
                <span className="text-[32px] leading-[40px] font-semibold num"><Contador v={contagem[c.k]} /></span>
                <span className="flex items-center gap-1.5 text-[14px]" style={{ color: P.texto2 }}><span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: P.status[KIND_DE[c.k]] }} />{c.label}</span>
              </button>
            ))}
          </div>
          {atual && <CartaoVeiculo p={P} it={atual} onFechar={() => setSel(null)}
            onCmd={(defId) => setCmd({ target: 'veiculo', assetId: atual.id, defId })} onShare={() => setShare(atual.asset)}
            onPercurso={() => nav(`/monitoramento/replay?a=${atual.id}`)} />}
          <label className="relative block">
            <span className="sr-only">Buscar veículo</span>
            <Icon name="busca" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setParada('alta')} placeholder="Buscar placa, motorista ou modelo"
              className="w-full h-12 pl-11 pr-4 rounded-full text-[16px] outline-none focus-visible:ring-2" style={{ background: P.cartao, color: P.texto }} />
          </label>
        </>}>
        <p className="px-1 pb-2 text-[13px]" style={{ color: P.texto2 }}>
          {lista.length} {lista.length === 1 ? 'veículo' : 'veículos'}{st ? ` · ${CONTADORES.find((c) => c.k === st)?.label.toLowerCase()}` : ''}{ultima ? <> · atualizado às <time className="num">{shortDT(ultima)}</time></> : null}
        </p>
        <ul aria-label="Veículos" className="flex flex-col">
          {lista.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => escolher(i.id)} aria-current={sel === i.id || undefined}
                className="w-full flex items-center gap-3 px-2 py-3 rounded-2xl text-left transition-colors" style={{ background: sel === i.id ? P.cartao : undefined }}>
                <Marca p={P} kind={i.kind} />
                <span className="min-w-0 flex-1 flex flex-col">
                  {isPlate(i.plate) ? <span className="mb-1"><Plate name={i.plate} size="md" /></span> : <span className="text-[16px] font-semibold truncate">{i.plate}</span>}
                  <span className="text-[13px] truncate" style={{ color: P.texto2 }}>{i.label}{i.blocked ? ' · bloqueado' : ''} · {i.driver}</span>
                </span>
                <span className="shrink-0 flex flex-col items-end">
                  <span className="text-[15px] font-medium num">{i.speed !== null ? `${i.speed} km/h` : '—'}</span>
                  <span className="text-[12px] num" style={{ color: P.texto2 }}>{i.ts ? shortDT(i.ts) : ''}</span>
                </span>
              </button>
            </li>
          ))}
          {!lista.length && <li className="py-10 text-center text-[14px]" style={{ color: P.texto2 }}>{itens.length ? 'Nenhum veículo com esse filtro.' : 'Nenhum veículo rastreado ainda.'}</li>}
        </ul>
        <p className="pt-6 pb-2 text-center text-[11px]" style={{ color: P.texto2 }}>Mapa © OpenStreetMap · OpenFreeMap · Estados © IBGE</p>
      </Folha>

      {/* os mesmos diálogos do Monitoramento (senha obrigatória no comando, links registrados no backend) */}
      <CommandModal state={cmd} onClose={() => setCmd(null)} />
      <ShareModal asset={share} onClose={() => setShare(null)} />
    </div>
  );
}

// ---------- mapa ----------
function useGlobo(itens: Item[], sel: string | null, setSel: (id: string | null) => void, P: Paleta) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [pronto, setPronto] = useState(false);
  const [versao, setVersao] = useState(0); // sobe a cada estilo carregado (troca de tema recria fontes e camadas)
  const selRef = useRef(setSel); selRef.current = setSel;
  const pRef = useRef(P); pRef.current = P;
  const primeira = useRef<[number, number] | null>(null);
  if (!primeira.current) { const p = itens.find((i) => i.pos)?.pos; if (p) primeira.current = [p[1], p[0]]; }

  useEffect(() => {
    if (!box.current) return;
    const el = box.current;
    const m = new maplibregl.Map({
      container: el, style: pRef.current.estilo, center: primeira.current ?? [-50, -14], zoom: zoomDoGlobo(el.clientWidth, el.clientHeight * 0.55),
      attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0,
    });
    m.touchZoomRotate.disableRotation();
    // sem inércia: o globo para ao soltar (Revolut, doc 03 § 3.2)
    m.dragPan.enable({ maxSpeed: 0 });
    // a cada estilo (o primeiro e cada troca de tema): globo, cores da paleta e as camadas da frota por cima
    m.on('style.load', () => {
      const p = pRef.current;
      m.setProjection({ type: 'globe' });
      m.setSky({ 'sky-color': p.espaco, 'horizon-color': p.aro, 'fog-color': p.espaco, 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.5, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] as any });
      const style = m.getStyle();
      // afastado: nenhuma camada vetorial (sem camada visível, o MapLibre nem pede os blocos pesados); rótulos e fronteiras
      // também só a partir de Z_VETOR
      const vetoriais = new Set(Object.entries(style.sources).filter(([, src]) => src.type === 'vector').map(([id]) => id));
      for (const l of style.layers) {
        if ('source' in l && vetoriais.has(l.source as string)) m.setLayerZoomRange(l.id, Math.max(l.minzoom ?? 0, Z_VETOR), l.maxzoom ?? 24);
      }
      if (!p.colorido) {
        // abaixo de Z_VETOR o fundo é o oceano e os continentes vêm do arquivo leve; acima, o fundo volta a ser terra e a água
        // vem do vetor
        if (m.getLayer('background')) m.setPaintProperty('background', 'background-color', ['interpolate', ['linear'], ['zoom'], Z_VETOR - 0.01, p.agua, Z_VETOR, p.terra, 9, p.rua.terra]);
        if (m.getLayer('water')) m.setPaintProperty('water', 'fill-color', ['interpolate', ['linear'], ['zoom'], Z_VETOR, p.agua, 9, p.rua.agua]);
        m.addSource('continentes', { type: 'geojson', data: CONTINENTES });
        m.addLayer({ id: 'continentes', type: 'fill', source: 'continentes', maxzoom: Z_VETOR, paint: { 'fill-color': p.terra } }, style.layers[1]?.id);
      }
      const primeiroRotulo = style.layers.find((l) => l.type === 'symbol')?.id;

      m.addSource('regiao', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const op = p.destaqueOpacidade;
      m.addLayer({ id: 'regiao', type: 'fill', source: 'regiao', paint: { 'fill-color': p.destaque, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3, op, 6, op * 0.35, 8, 0] } }, primeiroRotulo);
      if (p.destaqueBorda) m.addLayer({ id: 'regiao-borda', type: 'line', source: 'regiao', paint: { 'line-color': p.destaqueBorda, 'line-width': 1.5, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.9, 8, 0] } }, primeiroRotulo);

      m.addSource('veiculos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 44, clusterMaxZoom: 12 });
      m.addLayer({ id: 'grupo', type: 'circle', source: 'veiculos', filter: ['has', 'point_count'],
        paint: { 'circle-color': p.grupo, 'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 100, 22, 1000, 26], 'circle-stroke-width': 3, 'circle-stroke-color': p.grupo, 'circle-stroke-opacity': 0.25 } });
      m.addLayer({ id: 'grupo-n', type: 'symbol', source: 'veiculos', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true }, paint: { 'text-color': p.grupoTexto } });
      m.addLayer({ id: 'halo', type: 'circle', source: 'veiculos', filter: ['==', ['get', 'id'], ''], paint: { 'circle-radius': 18, 'circle-color': p.texto, 'circle-opacity': 0.18, 'circle-stroke-width': 2, 'circle-stroke-color': p.texto } });
      // desligado e sem sinal: anel (como no StatusGlyph), os demais ponto cheio
      m.addLayer({ id: 'veiculo', type: 'circle', source: 'veiculos', filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 7,
          'circle-color': ['match', ['get', 'kind'], 'off', p.folha, 'nosignal', p.folha, ['get', 'cor']],
          'circle-stroke-width': ['match', ['get', 'kind'], 'off', 2.5, 'nosignal', 2.5, 2],
          'circle-stroke-color': ['match', ['get', 'kind'], 'off', ['get', 'cor'], 'nosignal', ['get', 'cor'], p.folha],
        } });
      m.addLayer({ id: 'placa', type: 'symbol', source: 'veiculos', minzoom: 12, filter: ['!', ['has', 'point_count']],
        layout: { 'text-field': ['get', 'plate'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top' },
        paint: { 'text-color': p.texto, 'text-halo-color': p.espaco, 'text-halo-width': 1.5 } });
      setPronto(true);
      setVersao((n) => n + 1);
    });
    // eventos por id de camada continuam valendo depois de trocar o estilo (as camadas são recriadas com o mesmo id)
    m.on('click', 'veiculo', (e) => { const id = e.features?.[0]?.properties?.id; if (id) selRef.current(String(id)); });
    m.on('click', 'grupo', async (e) => {
      const f = e.features?.[0]; if (!f) return;
      const z = await (m.getSource('veiculos') as maplibregl.GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
      m.easeTo({ center: (f.geometry as any).coordinates, zoom: z + 0.5 });
    });
    for (const id of ['veiculo', 'grupo']) { m.on('mouseenter', id, () => { m.getCanvas().style.cursor = 'pointer'; }); m.on('mouseleave', id, () => { m.getCanvas().style.cursor = ''; }); }
    m.on('error', (e) => console.warn('[MonitoramentoGlobo] mapa:', e.error?.message || e));
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  // troca de tema: outro estilo de base; o style.load acima reaplica cores e camadas
  useEffect(() => { const m = map.current; if (m && pronto) m.setStyle(P.estilo); }, [P.estilo]);

  // veículos e estados em destaque acompanham o store (e cada estilo novo, que chega sem dados)
  useEffect(() => {
    const m = map.current; if (!m || !pronto) return;
    const comPos = itens.filter((i) => i.pos);
    (m.getSource('veiculos') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: comPos.map((i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [i.pos![1], i.pos![0]] }, properties: { id: i.id, plate: i.plate, kind: i.kind, cor: P.status[i.kind] } })) });
    let vivo = true;
    malhaUF().then((fc) => {
      if (!vivo) return;
      const pts = comPos.map((i) => [i.pos![1], i.pos![0]] as [number, number]);
      const ufs = fc.features.filter((f: any) => pts.some((p) => contem(f.geometry, p)));
      (m.getSource('regiao') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: ufs });
    }).catch((e) => console.warn('[MonitoramentoGlobo] malha das UFs:', e?.message || e));
    return () => { vivo = false; };
  }, [itens, pronto, versao]);

  useEffect(() => { const m = map.current; if (m && pronto && m.getLayer('halo')) m.setFilter('halo', ['==', ['get', 'id'], sel ?? '']); }, [sel, pronto, versao]);

  return { box, map, pronto };
}

// ---------- folha ----------
// O Sheet do sistema (mesmo gesto e mesmas paradas do resto do app), com a geometria e a paleta do globo: flutua a 7px das
// bordas, abaixo da barra do topo, e segue o tema do mapa.
type Parada = 'alta' | 'meio' | 'baixa';
const PARADAS: Parada[] = ['alta', 'meio', 'baixa'];
const DETENTS: SheetDetent[] = ['aberta', 'meio', 'topo']; // alta = inteira; meio = mapa e lista; baixa = só o topo

function Folha({ p, parada, setParada, onAltura, topo, children }: { p: Paleta; parada: Parada; setParada: (p: Parada) => void; onAltura: (h: number) => void; topo: React.ReactNode; children: React.ReactNode }) {
  return (
    <Sheet modal={false} bare label="Lista de veículos" detents={DETENTS} detent={PARADAS.indexOf(parada)} onDetent={(i) => setParada(PARADAS[i])} onVisible={onAltura}
      style={{ left: 7, right: 7, top: 'calc(max(12px, env(safe-area-inset-top)) + 60px)', height: 'auto', borderRadius: '32px 32px 0 0', background: p.folha, color: p.texto, ['--sheet-alca' as string]: p.alca }}
      top={<div className="flex flex-col gap-4 px-4 pb-4">{topo}</div>}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-[calc(var(--sheet-y,0px)+env(safe-area-inset-bottom,0px)+16px)]">{children}</div>
    </Sheet>
  );
}

// ---------- peças ----------
function Circulo({ p, label, icon, onClick, expanded }: { p: Paleta; label: string; icon: IconName; onClick: () => void; expanded?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} aria-expanded={expanded}
      className="w-11 h-11 rounded-full flex items-center justify-center active:scale-[0.94] transition-transform backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.12)]" style={{ background: p.circulo, color: p.texto }}>
      <Icon name={icon} size={22} />
    </button>
  );
}

// Claro / Escuro / Automático, com prévia na hora (Revolut, doc 03 § 4.1).
// Preso à borda direita da tela, não ao botão: o botão fica no meio da barra e o menu, alinhado a ele, saía pela esquerda no
// celular (390px). Cresce a partir do botão (transform-origin medido), como os outros menus.
function SeletorModo({ p, modo, ancora, onModo, onFechar }: { p: Paleta; modo: Modo; ancora: React.RefObject<HTMLElement>; onModo: (m: Modo) => void; onFechar: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const a = ancora.current?.getBoundingClientRect(), m = menu.current;
    if (a && m) m.style.transformOrigin = `${Math.round(a.left + a.width / 2 - m.getBoundingClientRect().left)}px top`;
  }, []);
  const ops: { m: Modo; label: string; icon: IconName }[] = [{ m: 'claro', label: 'Claro', icon: 'sol' }, { m: 'escuro', label: 'Escuro', icon: 'lua' }, { m: 'auto', label: 'Automático', icon: 'config' }];
  // portal acima da folha (o Sheet também vai para o body, em z 1060)
  return createPortal(
    <div className="fixed inset-0 z-[1070]">
      <div className="absolute inset-0" aria-hidden="true" onClick={onFechar} />
      <div ref={menu} role="radiogroup" aria-label="Aparência" className="anim-pop fixed right-4 top-[calc(max(12px,env(safe-area-inset-top))+52px)] w-[min(220px,calc(100vw-32px))] p-2 rounded-3xl flex flex-col gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.25)]" style={{ background: p.folha, color: p.texto }}>
        {ops.map((o) => (
          <button key={o.m} type="button" role="radio" aria-checked={modo === o.m} onClick={() => onModo(o.m)}
            className="h-11 px-3 rounded-2xl flex items-center gap-3 text-[15px] font-medium text-left" style={{ background: modo === o.m ? p.cartao : undefined }}>
            <Icon name={o.icon} size={20} /><span className="flex-1">{o.label}</span>{modo === o.m && <Icon name="ok" size={18} />}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function Marca({ p, kind }: { p: Paleta; kind: Kind }) {
  const anel = kind === 'off' || kind === 'nosignal';
  return (
    <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center" style={{ background: p.cartao }}>
      <span className={cx('w-3 h-3 rounded-full', anel && 'border-2', kind === 'nosignal' && 'border-dashed')} style={anel ? { borderColor: p.status[kind] } : { background: p.status[kind] }} />
    </span>
  );
}

// Cartão do veículo selecionado com as ações do rastreador (antes levavam ao Monitoramento): bloqueio em destaque — o que
// se faz na rua —, outros comandos, compartilhar e percurso. O envio passa pelo CommandModal, que exige a senha.
function CartaoVeiculo({ p, it, onFechar, onCmd, onShare, onPercurso }: { p: Paleta; it: Item; onFechar: () => void; onCmd: (defId?: string) => void; onShare: () => void; onPercurso: () => void }) {
  const acao = 'h-11 rounded-full font-medium text-[15px] flex items-center justify-center gap-2 active:scale-[0.97] transition-transform';
  return (
    <section aria-label={`Veículo ${it.plate}`} className="rounded-3xl p-4 flex flex-col gap-3" style={{ background: p.cartao }}>
      <div className="flex items-start gap-3">
        <Marca p={p} kind={it.kind} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold truncate">{isPlate(it.plate) ? <span className="block mb-1.5"><Plate name={it.plate} size="lg" /></span> : it.plate}</h2>
          <p className="text-[14px] truncate" style={{ color: p.texto2 }}>{it.label}{it.speed !== null ? ` · ${it.speed} km/h` : ''}{it.ts ? ` · ${shortDT(it.ts)}` : ''}</p>
          <p className="text-[14px] truncate" style={{ color: p.texto2 }}>{it.driver}{it.model ? ` · ${it.model}` : ''}{it.blocked ? ' · bloqueado' : ''}</p>
        </div>
        <button type="button" aria-label="Fechar veículo" onClick={onFechar} className="w-9 h-9 -mr-1 -mt-1 rounded-full flex items-center justify-center" style={{ color: p.texto2 }}><Icon name="fechar" size={20} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {it.blocked
          ? <button type="button" onClick={() => onCmd('c_desb')} className={acao} style={{ background: p.primario, color: p.primarioTexto }}><Icon name="cadeado" size={18} />Desbloquear</button>
          : <button type="button" onClick={() => onCmd('c_bloq')} className={acao} style={{ background: p.perigo, color: p.perigoTexto }}><Icon name="cadeado" size={18} />Bloquear</button>}
        <button type="button" onClick={() => onCmd()} className={acao} style={{ background: p.botao }}><Icon name="comando" size={18} />Comandos</button>
        <button type="button" onClick={onShare} className={acao} style={{ background: p.botao }}><Icon name="compartilhar" size={18} />Compartilhar</button>
        <button type="button" onClick={onPercurso} className={acao} style={{ background: p.botao }}><Icon name="rota" size={18} />Percurso</button>
        {it.pos && linksGoogle(it.pos).map((l) => (
          <a key={l.icon} href={l.href} target="_blank" rel="noreferrer" aria-label={l.label} className={cx(acao, 'min-w-0 px-3')} style={{ background: p.botao }}>
            <Icon name={l.icon} size={18} className="shrink-0" /><span className="truncate">{l.curto}</span>
          </a>
        ))}
      </div>
    </section>
  );
}


// contador da folha: conta até o valor na primeira carga (motion dos KPIs do sistema)
function Contador({ v }: { v: number }) {
  return <>{Math.round(useCountUp(v) ?? 0)}</>;
}
