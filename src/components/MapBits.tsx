import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, Marker, Polygon, Tooltip, useMap } from 'react-leaflet';
import type { StatusKind } from './story';
import { tv } from '../lib/tokens';
import { reducedMotion } from '../lib/motion';
import { MAP_GLYPH, AssetSilhouette, type Category, type SilhouetteKey } from './assetArt';
import { pngIconUrl } from '../lib/pngIcons';
import { StatusDot, Plate, Num } from './story';
import { IconButton, cx, Menu, type MenuItem } from './ui';
import { Icon } from './icons';
type Glyph = Category | 'reboque';
import { useAddress } from '../lib/geocode';

// Cercas na paleta de zonas (--zone-1..4), nunca nas cores de status: no mapa, verde, laranja e vermelho são dos veículos.
// O tipo da cerca define a zona: 1 empresa, 2 risco, 3 clientes e fornecedores, 4 serviços e outros.
const ZONE_OF: Record<string, number> = { Matriz: 1, Filial: 1, 'Pátio': 1, 'Área de risco': 2, Cliente: 3, Fornecedor: 3, Oficina: 4, Posto: 4, Outro: 4 };
export const fenceZone = (type?: string) => ZONE_OF[type || ''] || 4;
export const fenceColor = (type?: string) => tv(`--zone-${fenceZone(type)}`);
// Base OpenStreetMap colorida (filtro opcional via --map-tiles em tokens.css)
export const TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ATTR = '&copy; OpenStreetMap';

// Estilos de mapa (igual a sistemas de rastreamento estabelecidos: ruas e satélite).
export type MapStyleKey = 'ruas' | 'satelite';
export const MAP_STYLES: Record<MapStyleKey, { label: string; icon: string; url: string; attribution: string }> = {
  ruas: { label: 'Ruas', icon: 'locale', url: TILE, attribution: ATTR },
  satelite: { label: 'Satélite', icon: 'camera', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
};

// Alterna o elemento (normalmente a seção do mapa) em tela cheia via Fullscreen API, com fallback para
// o prefixo -webkit (Safari). Mantém o estado em sincronia mesmo se o usuário sair com Esc.
export function useFullscreen(ref: React.RefObject<HTMLElement>) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, [ref]);
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else ref.current?.requestFullscreen?.();
  };
  return [on, toggle] as const;
}

// Disco na cor do status com uma seta de direção (sempre visível, gira com o heading); sem glifo por tipo de
// ativo — a aparência do veículo fica no card da seleção (VehicleCard) e nas listas, não no marcador.
// Cores: .veh-marker[data-k] em styles/base.css. `category`/`pic` seguem aceitos por compatibilidade e são ignorados.
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function vehIcon({ plate, kind, heading = 0, selected = false, note }: { plate: string; kind: StatusKind; category?: Glyph; pic?: string; heading?: number; selected?: boolean; note?: string }) {
  const h = Math.round(heading || 0);
  const dir = `<svg class="veh-dir" width="16" height="16" viewBox="0 0 24 24" style="transform:rotate(${h}deg)" aria-hidden="true"><path d="M12 2.5 19 21l-7-4.5L5 21z" /></svg>`;
  return L.divIcon({
    className: '', iconSize: [180, 30], iconAnchor: [15, 15],
    html: `<div class="veh-marker${selected ? ' sel' : ''}" data-k="${kind}"><span class="disc">${dir}</span><span class="tag">${esc(plate)}${note ? `<span class="note">${esc(note)}</span>` : ''}</span></div>`,
  });
}

// Marcador de veículo que desliza até a nova posição em duração fixa (--t-glide), sem esticar pelo intervalo
// do rastreador: a posição mostrada chega logo, não fica atrasada. Gira pelo caminho mais curto (359° → 1° = 2°).
// Pula sem animar quando: salto absurdo (> JUMP_M), aba em segundo plano, prefers-reduced-motion,
// fora da área visível, ou animate=false (ex.: marcador agrupado num cluster, se um dia houver).
const JUMP_M = 3000;
const glideMs = () => parseFloat(tv('--t-glide')) || 800;
export function GlideMarker({ position, heading = 0, kind, category, plate, selected, note, title, onClick, animate = true }: {
  position: [number, number]; heading?: number; kind: StatusKind; category?: Glyph; pic?: string; plate: string; selected?: boolean; note?: string; title?: string; onClick?: () => void; animate?: boolean;
}) {
  const map = useMap();
  const ref = useRef<L.Marker>(null);
  const [initial] = useState(position); // a posição seguinte é aplicada por setLatLng, não pela prop
  const ang = useRef(heading || 0);
  const raf = useRef(0);
  // o ícone só é recriado quando muda o texto ou a seleção; seta e cor são aplicadas no DOM para poderem transicionar
  const icon = useMemo(() => vehIcon({ plate, kind, heading: ang.current, selected, note }), [plate, selected, note]);
  const arrow = () => ref.current?.getElement()?.querySelector<HTMLElement>('.veh-dir');
  const rotate = () => { const s = arrow(); if (s) s.style.transform = `rotate(${ang.current}deg)`; };
  useEffect(() => { const el = ref.current?.getElement()?.querySelector<HTMLElement>('.veh-marker'); if (el) el.dataset.k = kind; rotate(); }, [icon, kind]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const from = m.getLatLng(), to = L.latLng(position[0], position[1]);
    const a0 = ang.current, d = ((((heading || 0) - a0) % 360) + 540) % 360 - 180;
    const view = map.getBounds().pad(0.25);
    const snap = !animate || document.hidden || reducedMotion() || from.distanceTo(to) > JUMP_M || (!view.contains(from) && !view.contains(to));
    cancelAnimationFrame(raf.current);
    if (snap) { m.setLatLng(to); ang.current = a0 + d; rotate(); return; }
    const t0 = performance.now(), ms = glideMs();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      m.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e]);
      ang.current = a0 + d * e; rotate();
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current); // nova posição no meio do caminho: recomeça de onde está
  }, [position[0], position[1], heading, animate]);
  return <Marker ref={ref} position={initial} icon={icon} title={title} eventHandlers={onClick ? { click: onClick } : undefined} />;
}

// rumo (graus, 0 = norte) entre dois pontos, para quando o rastreador não manda o heading
export function bearing(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

export function FenceShapes({ fences }: { fences: any[] }) {
  return <>{fences.map((f) => {
    const c = fenceColor(f.type);
    const opts = { color: c, weight: parseFloat(tv('--zone-stroke-width')) || 2, opacity: 0.9, fillColor: c, fillOpacity: parseFloat(tv('--zone-fill-opacity')) || 0.14, dashArray: '5 5' };
    const tip = <Tooltip direction="top">{f.name} · {f.type}</Tooltip>;
    return f.shape === 'circle' ? <Circle key={f.id} center={f.center} radius={f.radius} pathOptions={opts}>{tip}</Circle> : <Polygon key={f.id} positions={f.points} pathOptions={opts}>{tip}</Polygon>;
  })}</>;
}

// Agrupamento de marcadores para frotas grandes (600–2.000 veículos): grade em pixels no zoom atual, só dentro
// da área visível (o resto nem é montado). O selecionado nunca entra num grupo. Um grupo mostra a contagem e um
// ponto crítico se houver crítico dentro (status = ponto, sem fundo colorido); clicar aproxima até separar.
// Os veículos agrupados não são montados como GlideMarker; ao sair do grupo montam direto na posição atual,
// sem deslizar desde o centro do grupo.
const CELL = 64, MAX_CLUSTER_ZOOM = 16;
export type MapItem = { id: string; pos: [number, number]; kind: StatusKind; node: () => JSX.Element };
const clusterIcon = (n: number, crit: boolean) => L.divIcon({
  className: '', iconSize: [0, 0], iconAnchor: [0, 0],
  html: `<div class="veh-cluster${n >= 100 ? ' lg' : ''}">${crit ? '<span class="dot" aria-hidden="true"></span>' : ''}<span class="num">${n}</span></div>`,
});
export function ClusteredVehicles({ items, selected, grouped = true }: { items: MapItem[]; selected?: string | null; grouped?: boolean }) {
  const map = useMap();
  const [view, setView] = useState(0);
  useEffect(() => { const f = () => setView((v) => v + 1); map.on('zoomend moveend', f); return () => { map.off('zoomend moveend', f); }; }, [map]);
  const { singles, groups } = useMemo(() => {
    const z = map.getZoom(), b = map.getBounds().pad(0.2);
    const vis = items.filter((x) => x.id === selected || b.contains(x.pos));
    if (!grouped || z >= MAX_CLUSTER_ZOOM) return { singles: vis, groups: [] as { key: string; m: MapItem[] }[] };
    const cells = new Map<string, MapItem[]>(), singles: MapItem[] = [];
    for (const x of vis) {
      if (x.id === selected) { singles.push(x); continue; }
      const p = map.project(x.pos, z), key = `${Math.floor(p.x / CELL)}:${Math.floor(p.y / CELL)}`;
      (cells.get(key) || cells.set(key, []).get(key)!).push(x);
    }
    const groups: { key: string; m: MapItem[] }[] = [];
    cells.forEach((m, key) => (m.length === 1 ? singles.push(m[0]) : groups.push({ key, m })));
    return { singles, groups };
  }, [items, selected, grouped, view, map]);
  return <>
    {singles.map((x) => <Fragment key={x.id}>{x.node()}</Fragment>)}
    {groups.map(({ key, m }) => {
      const lat = m.reduce((s, x) => s + x.pos[0], 0) / m.length, lng = m.reduce((s, x) => s + x.pos[1], 0) / m.length;
      const crit = m.some((x) => x.kind === 'crit');
      return <Marker key={key} position={[lat, lng]} icon={clusterIcon(m.length, crit)} title={`${m.length} veículos${crit ? ' · com crítico' : ''}`}
        eventHandlers={{ click: () => map.fitBounds(L.latLngBounds(m.map((x) => x.pos)), { padding: [60, 60], maxZoom: MAX_CLUSTER_ZOOM }) }} />;
    })}
  </>;
}

// endereço por extenso (lib/geocode); enquanto carrega ou se falhar, mostra as coordenadas
export function Address({ pos, className = '' }: { pos?: [number, number] | null; className?: string }) {
  const addr = useAddress(pos);
  if (!pos) return null;
  return addr ? <span className={className}>{addr}</span> : <span className={`font-mono text-caption text-ink-2 ${className}`}>{pos[0].toFixed(5)}, {pos[1].toFixed(5)}</span>;
}

// Card do veículo selecionado (popup sobre o mapa ou painel lateral): status, silhueta da categoria, placa,
// modelo, onde está, métricas e ações. É aqui, e não no marcador, que aparece a aparência do veículo.
export function VehicleCard({ plate, silhouette, icon, photo, model, place, kind, statusLabel, statusSub, metrics = [], actions = [], onClose, className = '' }: {
  plate: string; silhouette: SilhouetteKey; icon?: string; photo?: string; model?: string; place?: React.ReactNode; kind: StatusKind; statusLabel?: string; statusSub?: string;
  metrics?: { icon: string; value: React.ReactNode; label: string }[]; actions?: { icon: string; label: string; onClick?: () => void }[]; onClose?: () => void; className?: string;
}) {
  const iconUrl = icon && pngIconUrl(icon);
  return (
    <section aria-label={`Veículo ${plate}`} className={cx('bg-card border border-line rounded-panel shadow-pop p-card-sm w-full max-w-[380px]', className)}>
      <header className="flex items-center gap-2 min-w-0">
        <StatusDot kind={kind} label={statusLabel} className="text-body font-medium shrink-0" />
        {statusSub && <span className="text-small text-ink-2 num truncate min-w-0">· {statusSub}</span>}
        {onClose && <IconButton aria-label="Fechar" size="sm" className="ml-auto -mr-1" onClick={onClose}><Icon name="fechar" size={18} /></IconButton>}
      </header>
      <div className="flex items-center gap-4 mt-3">
        {photo ? <img src={photo} alt={`Foto de ${plate}`} loading="lazy" decoding="async" className="w-28 h-12 rounded-tight object-cover shrink-0" />
          : iconUrl ? <img src={iconUrl} alt="" draggable={false} decoding="async" className="w-28 h-12 object-contain shrink-0" />
          : <AssetSilhouette category={silhouette} className="w-28 h-12 text-ink-3 shrink-0" />}
        <div className="min-w-0">
          <Plate name={plate} size="lg" />
          {model && <p className="text-small text-ink-2 mt-tight truncate">{model}</p>}
          {place && <p className="text-small text-ink-2 truncate">{place}</p>}
        </div>
      </div>
      {metrics.length > 0 && (
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(70px,1fr))] gap-3 mt-4 pt-4 border-t border-line">
          {metrics.map((m) => <div key={m.label} className="flex items-start gap-tight min-w-0"><Icon name={m.icon} size={18} className="text-ink-2 shrink-0 mt-hair" /><div className="min-w-0"><dd className="text-body font-semibold num truncate">{m.value}</dd><dt className="text-caption text-ink-2 truncate">{m.label}</dt></div></div>)}
        </dl>
      )}
      {actions.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(64px,1fr))] gap-1 mt-4 pt-3 border-t border-line">
          {actions.map((a) => <button key={a.label} type="button" onClick={a.onClick} className="flex flex-col items-center gap-1 py-2 rounded-ctl text-caption text-ink hover:bg-card-2"><Icon name={a.icon} size={20} className="text-ink-2" />{a.label}</button>)}
        </div>
      )}
    </section>
  );
}

// Botão flutuante sobre o mapa (camada liga/desliga ou ação). pressed = camada visível (ponto cheio).
export function MapButton({ icon, label, onClick, pressed, title }: { icon: string; label: string; onClick: () => void; pressed?: boolean; title?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} title={title}
      className={cx('h-9 pl-stack pr-3 rounded-btn bg-card border border-line shadow-float flex items-center gap-tight text-small font-medium transition-colors hover:bg-card-2', pressed === false ? 'text-ink-2' : 'text-ink')}>
      <Icon name={icon} size={18} className={pressed === false ? 'text-ink-3' : 'text-ink-2'} />{label}
      {pressed !== undefined && <span aria-hidden="true" className={cx('ml-1 w-2 h-2 rounded-pill', pressed ? 'bg-graphite' : 'border border-ink-3')} />}
    </button>
  );
}
// Grupo vertical de controles do mapa (aproximar, afastar, ver tudo, centralizar)
export function MapControls({ items }: { items: { icon: string; label: string; onClick: () => void }[] }) {
  return (
    <div className="flex flex-col bg-card border border-line rounded-btn shadow-float overflow-hidden divide-y divide-line">
      {items.map((it) => <button key={it.label} type="button" aria-label={it.label} title={it.label} onClick={it.onClick} className="w-9 h-9 flex items-center justify-center text-ink hover:bg-card-2"><Icon name={it.icon} size={18} /></button>)}
    </div>
  );
}

// Linha de veículo das listas ao vivo: silhueta, placa em chip, status, modelo, motorista, local, velocidade (com tendência) e hora.
export function VehicleListItem({ silhouette, icon, photo, plate, kind, statusLabel, model, driver, pos, detail, speed, time, selected, onClick, menu }: {
  silhouette: SilhouetteKey; icon?: string; photo?: string; plate: string; kind: StatusKind; statusLabel?: string; model?: React.ReactNode; driver?: React.ReactNode; pos?: [number, number] | null;
  detail?: React.ReactNode; speed?: number | null; time?: React.ReactNode; selected?: boolean; onClick?: () => void; menu?: MenuItem[];
}) {
  const iconUrl = icon && pngIconUrl(icon);
  const moving = speed != null && speed > 0;
  const key = (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } };
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={key} aria-current={selected ? 'true' : undefined}
      className={cx('relative w-full text-left flex items-start gap-x-3 px-3 py-stack rounded-ctl row-hover cursor-pointer', selected ? 'bg-surface-selected' : 'hover:bg-card-2')}>
      {selected && <span aria-hidden="true" className={cx('absolute left-0 top-1 bottom-1 w-[3px] rounded-pill bg-current', `st-${kind}`)} />}
      {photo ? <img src={photo} alt={`Foto de ${plate}`} loading="lazy" decoding="async" className="w-14 h-9 rounded-tight object-cover shrink-0 mt-hair" />
        : iconUrl ? <img src={iconUrl} alt="" draggable={false} decoding="async" className="w-14 h-9 object-contain shrink-0 mt-hair" />
        : <AssetSilhouette category={silhouette} className="w-14 h-9 text-ink-3 shrink-0 mt-hair" />}
      <span className="flex flex-col gap-hair min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0"><Plate name={plate} size="sm" /><StatusDot kind={kind} label={statusLabel} className="text-caption" /></span>
        {model && <span className="text-body font-medium text-ink truncate">{model}</span>}
        {driver && <span className="flex items-center gap-1 text-small text-ink-2 truncate"><Icon name="usuario" size={14} className="text-ink-3 shrink-0" />{driver}</span>}
        {pos && <span className="flex items-center gap-1 text-small text-ink-2 truncate"><Icon name="centralizar" size={14} className="text-ink-3 shrink-0" /><Address pos={pos} /></span>}
        {detail && <span className="text-small text-ink-2 truncate">{detail}</span>}
      </span>
      <span className="flex flex-col items-end gap-1 shrink-0 pl-2">
        <span className="flex items-center gap-1">
          {speed == null ? <span className="text-body text-ink-3">—</span> : <Num value={speed} unit="km/h" size="body" className="font-medium" />}
          {moving && <Icon name="chevron" size={14} className={cx('-rotate-45', `st-${kind}`)} />}
        </span>
        {time && <span className="flex items-center gap-1 text-caption text-ink-3 num"><Icon name="relogio" size={13} />{time}</span>}
      </span>
      {menu && menu.length > 0 && <Menu items={menu} label={`Mais opções · ${plate}`} trigger={({ ref, toggle }) => <button ref={ref} type="button" aria-label={`Mais opções · ${plate}`} onClick={(e) => { e.stopPropagation(); toggle(); }} className="shrink-0 w-7 h-7 -mr-1 flex items-center justify-center rounded-tight text-ink-3 hover:text-ink hover:bg-surface-hover"><Icon name="mais-opcoes" size={18} /></button>} />}
    </div>
  );
}
