// Tooltip dos gráficos: cartão pequeno branco com sombra leve, preso a um ponto (topo da barra, ponto da linha).
// Aparece na hora (sem atraso nem animação de posição, para não tremer), fica acima do ponto e vira para baixo
// quando não cabe; nunca sai da tela. Mouse: segue o hover. Toque: abre com um toque e fecha ao tocar fora.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { paraUi, uiZoom, viewportUi } from '../lib/uiZoom';

export type TipAnchor = { x: number; y: number }; // coordenadas da janela (clientX/clientY) do ponto lido
type TipState = { at: TipAnchor; content: React.ReactNode; key: string | number; pinned: boolean } | null;

export function useChartTip() {
  const [tip, setTip] = useState<TipState>(null);
  const pinnedRef = useRef(false);
  const show = useCallback((key: string | number, at: TipAnchor, content: React.ReactNode, pinned = false) => {
    pinnedRef.current = pinned;
    setTip({ key, at, content, pinned });
  }, []);
  const hide = useCallback((force = false) => { if (force || !pinnedRef.current) { pinnedRef.current = false; setTip(null); } }, []);
  // toque fixa o tooltip; toque fora, rolagem ou Esc fecham
  useEffect(() => {
    if (!tip) return;
    const close = () => hide(true);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const down = (e: PointerEvent) => { if (!(e.target as Element)?.closest?.('[data-chart-hit]')) close(); };
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close); document.addEventListener('keydown', key); document.addEventListener('pointerdown', down);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down); };
  }, [!!tip, hide]);
  /** props para um alvo de hover: mouse mostra e esconde; toque (ou clique) fixa */
  const target = (key: string | number, anchor: (el: Element) => TipAnchor, content: () => React.ReactNode) => ({
    'data-chart-hit': '',
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') show(key, anchor(e.currentTarget), content()); },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') hide(); },
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); if (tip?.key === key && tip.pinned) hide(true); else show(key, anchor(e.currentTarget), content(), true); },
  });
  const node = tip ? <ChartTip at={tip.at}>{tip.content}</ChartTip> : null;
  return { tip, show, hide, target, node, active: tip?.key ?? null };
}

/** ponto de ancoragem: x/y locais (px do SVG) somados à posição do elemento que contém o SVG */
export const anchorIn = (box: HTMLElement | null, x: number, y: number): TipAnchor => {
  // x/y são px do SVG (página); a âncora é de tela: passa pela escala da interface
  const r = box?.getBoundingClientRect(), z = uiZoom();
  return { x: (r?.left ?? 0) + x * z, y: (r?.top ?? 0) + y * z };
};
/** topo-centro de um elemento (barra HTML, fatia, segmento) */
export const anchorTop = (el: Element): TipAnchor => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top }; };

function ChartTip({ at, children }: { at: TipAnchor; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    // âncora vem em coordenadas de tela; posição do tooltip em px da página (escala da interface, lib/uiZoom.ts)
    const w = el.offsetWidth, h = el.offsetHeight, gap = 12, m = 8, { w: vw, h: vh } = viewportUi(), ax = paraUi(at.x), ay = paraUi(at.y);
    const left = Math.max(m, Math.min(vw - w - m, ax - w / 2));
    const above = ay - h - gap;
    const top = above >= m ? above : Math.min(vh - h - m, ay + gap + 8);
    setPos({ left, top });
  }, [at.x, at.y, children]);
  return createPortal(
    <div ref={ref} role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      className="fixed z-[1500] pointer-events-none min-w-[140px] max-w-[280px] bg-card border border-line rounded-ctl shadow-pop px-3 py-stack text-small text-ink">
      {children}
    </div>,
    document.body,
  );
}

// Conteúdo padrão: título (período ou item) e linhas com marcador, rótulo e valor à direita.
export type TipRow = { label: React.ReactNode; value: React.ReactNode; swatch?: React.ReactNode; strong?: boolean; tone?: 'muted' };
export function TipBody({ title, rows, foot }: { title?: React.ReactNode; rows: TipRow[]; foot?: React.ReactNode }) {
  return (
    <>
      {title && <p className="text-caption text-ink-2 mb-tight num">{title}</p>}
      <dl className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            {r.swatch}
            <dt className={r.tone === 'muted' ? 'text-ink-2' : 'text-ink'}>{r.label}</dt>
            <dd className={`ml-auto pl-3 num whitespace-nowrap ${r.strong ? 'font-semibold' : ''}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
      {foot && <div className="mt-tight pt-tight border-t border-line text-caption text-ink-2 num">{foot}</div>}
    </>
  );
}
export const Swatch = ({ color, hatch, line, dashed }: { color: string; hatch?: boolean; line?: boolean; dashed?: boolean }) =>
  line ? <svg aria-hidden="true" width="14" height="8" className="shrink-0"><line x1="1" x2="13" y1="4" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '3 2' : undefined} /></svg>
    : <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-swatch shrink-0 ${hatch ? 'hatch-real' : ''}`} style={hatch ? undefined : { background: color }} />;

/** variação em % entre dois valores, com seta e cor (verde melhorou, rosa piorou; sem `good`, neutra) */
export function DeltaText({ cur, prev, good }: { cur: number; prev: number | null | undefined; good?: 'up' | 'down' }) {
  if (prev == null || !prev) return null;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  if (!isFinite(d)) return null;
  const flat = Math.abs(d) < 0.05, up = d > 0;
  const better = flat || !good ? null : (up && good === 'up') || (!up && good === 'down');
  return <span className={better == null ? 'text-ink-2' : better ? 'text-pos font-medium' : 'text-loss-ink font-medium'}>{flat ? '=' : up ? '↑' : '↓'} {Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>;
}
