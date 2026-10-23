// Gráficos da plataforma. Duas cores de dado com significado fixo:
// azul = realizado/atual · rosa = perda, excesso ou desvio · hachura = estimado, meta ou previsto.
// Todos têm tooltip (chartTip.tsx): barra destacada no hover, rótulo do período, valor em pt-BR e, quando houver,
// o anterior e a variação; nas linhas, régua vertical e ponto em cada série. No toque, abre com um toque.
import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { cx } from './ui';
import { Num, StatusGlyph, type StatusKind } from './story';
import { chartTokens } from '../lib/tokens';
import { isPlate } from '@localle/shared/utils';
import { useChartTip, anchorIn, anchorTop, TipBody, Swatch, DeltaText, type TipRow } from './chartTip';
export { Swatch } from './chartTip';

// Padrões de hachura para SVG: use fill={`url(#${p}hatch-real)`}, com um prefixo único por gráfico (useId).
export function hatchDefs(p = '') {
  const pat = (id: string, bg: string, fg: string, w = 1.5) => (
    <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" style={{ fill: bg }} /><line x1="0" y1="0" x2="0" y2="6" style={{ stroke: fg }} strokeWidth={w * 1.4} />
    </pattern>
  );
  return <defs>{pat(p + 'hatch-real', 'var(--real-soft)', 'var(--real)')}{pat(p + 'hatch-loss', 'var(--loss-soft)', 'var(--loss)')}{pat(p + 'hatch-target', 'var(--card-2)', 'var(--target)', 1)}</defs>;
}

// Cascata "por que está abaixo da meta": topo hachurado, uma barra rosa por causa, real em azul sólido
export function Waterfall({ top, causes, bottom, goal, scale, format, formatDelta }: {
  top: { label: string; value: number }; causes: { label: string; value: number; detail?: string }[]; bottom: { label: string; value: number };
  goal?: { value: number; label: string }; scale: [number, number]; format: (v: number) => string; formatDelta: (v: number) => string;
}) {
  const tip = useChartTip();
  const at = (v: number) => Math.max(0, Math.min(100, ((v - scale[0]) / (scale[1] - scale[0])) * 100));
  let run = top.value;
  const rows = causes.map((c) => { const r = { ...c, from: run - c.value, to: run }; run -= c.value; return r; });
  // função (não componente): um componente declarado aqui remontaria a cada hover e perderia o ponteiro
  const row = ({ k, label, detail, value, children, strong = false, tipRows }: { k: string; label: string; detail?: string; value: React.ReactNode; children: React.ReactNode; strong?: boolean; tipRows: { label: string; value: string }[] }) => (
    <li key={k} className={cx('grid grid-cols-[minmax(0,11rem)_1fr_auto] max-sm:grid-cols-[1fr_auto] items-center gap-x-4 gap-y-tight py-2 -mx-2 px-2 rounded-tight cursor-default transition-colors', tip.active === k && 'bg-surface-muted')}
      {...tip.target(k, anchorTop, () => <TipBody title={label} rows={tipRows} foot={detail} />)}>
      <div className="min-w-0"><div className={cx('text-small leading-tight', strong ? 'font-semibold text-ink' : 'text-ink')}>{label}</div>{detail && <div className="text-caption text-ink-2 leading-tight mt-hair">{detail}</div>}</div>
      <div className="relative h-7 max-sm:col-span-2 max-sm:order-last">{children}</div>
      <div className={cx('text-small text-right num whitespace-nowrap', strong ? 'font-semibold' : '')}>{value}</div>
    </li>
  );
  return (
    <div className="relative">
      <ol className="flex flex-col">
        {row({ k: 'top', label: top.label, value: format(top.value), tipRows: [{ label: 'Valor', value: format(top.value) }], children: <div className="absolute inset-y-0 left-0 rounded-chip bg-surface-muted grow-x" style={{ width: `${at(top.value)}%` }} /> })}
        {rows.map((c, i) => (
          row({ k: 'c' + i, label: c.label, detail: c.detail, value: <span className="text-loss-ink">{formatDelta(-c.value)}</span>, tipRows: [{ label: 'Perda', value: formatDelta(-c.value) }, { label: 'Depois desta causa', value: format(c.from) }],
            children: <div className="absolute inset-y-0 rounded-chip bg-loss grow-x" style={{ left: `${at(c.from)}%`, width: `max(3px, ${at(c.to) - at(c.from)}%)`, ['--i' as any]: i + 1 }} /> })
        ))}
        {row({ k: 'bottom', label: bottom.label, value: format(bottom.value), strong: true, tipRows: [{ label: 'Valor', value: format(bottom.value) }, ...(goal ? [{ label: goal.label, value: format(goal.value) }] : [])], children: <div className="absolute inset-y-0 left-0 rounded-chip bg-real grow-x" style={{ width: `${at(bottom.value)}%`, ['--i' as any]: rows.length + 1 }} /> })}
      </ol>
      {goal && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 grid grid-cols-[minmax(0,11rem)_1fr_auto] max-sm:hidden gap-x-4 w-full">
          <span /><span className="relative"><span className="absolute -top-3 bottom-0 border-l border-dashed border-ink" style={{ left: `${at(goal.value)}%` }} /><span className="absolute -top-6 -translate-x-1/2 text-caption font-medium whitespace-nowrap" style={{ left: `${at(goal.value)}%` }}>{goal.label}</span></span><span className="invisible text-small num">{format(top.value)}</span>
        </div>
      )}
      {tip.node}
    </div>
  );
}

// Matriz de calor: categorias × causas, intensidade em tons de rosa, total por linha
export function HeatMatrix({ cols, rows }: { cols: { key: string; label: string }[]; rows: { key: string; label: string; cells: number[]; total: number }[] }) {
  const tip = useChartTip();
  const max = Math.max(1, ...rows.flatMap((r) => r.cells));
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full border-separate border-spacing-1 text-small" style={{ minWidth: 120 + cols.length * 64 }}>
        <thead><tr><th className="sr-only">Categoria</th>{cols.map((c) => <th key={c.key} scope="col" className="font-normal text-caption text-ink-2 text-left align-bottom px-tight pb-1 leading-tight">{c.label}</th>)}<th scope="col" className="font-medium text-caption text-ink-2 text-right pb-1 pl-3">Total</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="text-left font-normal text-ink pr-3 whitespace-nowrap">{r.label}</th>
              {r.cells.map((v, j) => {
                const k = v / max, id = `${r.key}:${j}`;
                return <td key={j} className={cx('h-10 rounded-tight px-2 num text-ink cursor-default', tip.active === id && 'outline outline-2 outline-ink -outline-offset-2')} style={{ background: v ? `color-mix(in srgb, var(--loss) ${Math.round(8 + k * 62)}%, var(--card))` : 'var(--surface-muted)' }}
                  {...tip.target(id, anchorTop, () => <TipBody title={`${r.label} · ${cols[j]?.label}`} rows={[{ label: 'Eventos', value: v, strong: true }, { label: 'Parte da linha', value: r.total ? `${Math.round((v / r.total) * 100)}%` : '—', tone: 'muted' }]} />)}>{v || ''}<span className="sr-only">{v ? '' : '0'}</span></td>;
              })}
              <td className="text-right font-semibold num pl-3">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tip.node}
    </div>
  );
}

// Matriz de pontos: um ponto por evento por dia; anterior em cinza, atual em rosa, pico rotulado
export function DotMatrix({ cur, prev, labels, peakLabel }: { cur: number[]; prev: number[]; labels: string[]; peakLabel?: (v: number, i: number) => string }) {
  const tip = useChartTip();
  const n = cur.length, max = Math.max(1, ...cur, ...prev);
  const colW = 22, gap = Math.min(9, 140 / max), r = Math.min(3.5, gap / 2.3), H = Math.max(80, max * gap + 40), W = n * colW;
  const peak = cur.indexOf(Math.max(...cur));
  const C = chartTokens();
  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" style={{ minWidth: W * 0.75 }} role="img" aria-label={`Período atual: ${cur.reduce((a, b) => a + b, 0)} eventos; período anterior: ${prev.reduce((a, b) => a + b, 0)}.`}>
          <line x1="0" x2={W} y1={H} y2={H} stroke={C.line} />
          {cur.map((v, i) => {
            const cx0 = i * colW + colW / 2;
            return (
              <g key={i}>
                {tip.active === i && <rect x={i * colW + 1} y={0} width={colW - 2} height={H} rx={4} fill="var(--surface-muted)" />}
                {Array.from({ length: prev[i] }, (_, k) => <circle key={'p' + k} cx={cx0 - 4.5} cy={H - 8 - k * gap} r={r} fill={C.prev} />)}
                {Array.from({ length: v }, (_, k) => <circle key={'c' + k} cx={cx0 + 4.5} cy={H - 8 - k * gap} r={r} fill={C.loss} className="grow-y" style={{ ['--i' as any]: i, transformBox: 'fill-box', transformOrigin: 'center' } as any} />)}
                {(i % 5 === 0 || i === n - 1) && <text x={cx0} y={H + 16} textAnchor="middle" fontSize="11" fill={C.ink3} className="num">{labels[i]}</text>}
                <rect x={i * colW} y={0} width={colW} height={H} fill="transparent" className="cursor-default"
                  {...tip.target(i, (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height - (Math.max(v, prev[i] || 0) * gap + 8) * (b.height / H) }; },
                    () => <TipBody title={labels[i]} rows={[{ swatch: <Swatch color="var(--loss)" />, label: 'Período atual', value: v, strong: true }, { swatch: <Swatch color="var(--prev)" />, label: 'Período anterior', value: prev[i] ?? 0, tone: 'muted' }]} foot={<DeltaText cur={v} prev={prev[i]} good="down" />} />)} />
              </g>
            );
          })}
          {cur[peak] > 0 && <g pointerEvents="none"><text x={Math.min(W - 2, Math.max(2, peak * colW + colW / 2 + 4.5))} y={H - 8 - (cur[peak] - 1) * gap - 12} textAnchor={peak > n - 3 ? 'end' : peak < 2 ? 'start' : 'middle'} fontSize="12" fontWeight="600" fill={C.ink}>{peakLabel ? peakLabel(cur[peak], peak) : cur[peak]}</text></g>}
        </svg>
      </div>
      <figcaption className="flex gap-5 mt-3 text-caption text-ink-2"><span className="inline-flex items-center gap-tight"><svg width="8" height="8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" style={{ fill: 'var(--prev)' }} /></svg>Período anterior</span><span className="inline-flex items-center gap-tight"><svg width="8" height="8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" style={{ fill: 'var(--loss)' }} /></svg>Período atual</span></figcaption>
      {tip.node}
    </figure>
  );
}

// Estimado × realizado por item: hachurado (estimado) sobre sólido (realizado), excesso em rosa hachurado
export function EstVsReal({ items, format }: { items: { key: string; label: string; sub?: string; est: number; real: number }[]; format: (v: number) => string }) {
  const tip = useChartTip();
  const max = Math.max(1, ...items.flatMap((i) => [i.est, i.real]));
  const w = (v: number) => `${(v / max) * 100}%`;
  return (
    <ul className="flex flex-col">
      {items.map((it, i) => {
        const over = it.real - it.est;
        return (
          <li key={it.key} className={cx('grid grid-cols-[minmax(0,10rem)_1fr_auto] max-sm:grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-center py-3 -mx-2 px-2 rounded-tight border-t border-line first:border-t-0 cursor-default transition-colors', tip.active === it.key && 'bg-surface-muted')}
            {...tip.target(it.key, anchorTop, () => <TipBody title={it.label} rows={[{ swatch: <Swatch color="" hatch />, label: 'Estimado', value: format(it.est), tone: 'muted' }, { swatch: <Swatch color="var(--real)" />, label: 'Realizado', value: format(it.real), strong: true }]} foot={over > 0 ? <span className="text-loss-ink font-medium">+{format(over)} acima do estimado</span> : 'Dentro do estimado'} />)}>
            <div className="min-w-0"><div className={cx('text-small font-medium truncate', isPlate(it.label) && 'font-mono')}>{it.label}</div>{it.sub && <div className="text-caption text-ink-2 truncate">{it.sub}</div>}</div>
            <div className="flex flex-col gap-1 max-sm:col-span-2 max-sm:order-last" aria-hidden="true">
              <div className="h-2.5 rounded-pill hatch-real grow-x" style={{ width: w(it.est), ['--i' as any]: i }} />
              <div className="relative h-2.5">
                <div className="absolute inset-y-0 left-0 rounded-pill bg-real grow-x" style={{ width: w(Math.min(it.real, it.est)), ['--i' as any]: i }} />
                {over > 0 && <div className="absolute inset-y-0 rounded-r-pill hatch-loss grow-x" style={{ left: w(it.est), width: w(over), ['--i' as any]: i + 1 }} />}
              </div>
            </div>
            <div className="text-right text-small num whitespace-nowrap">
              <div><span className="text-ink-2">{format(it.est)}</span> <span className="text-ink-3" aria-label="para">→</span> <span className="font-medium">{format(it.real)}</span></div>
              <div className={cx('text-caption', over > 0 ? 'text-loss-ink font-medium' : 'text-ink-2')}>{over > 0 ? `+${format(over)}` : 'No plano'}</div>
            </div>
          </li>
        );
      })}
      {tip.node}
    </ul>
  );
}

// Linha de lista com barra feita na própria tela (consumo × meta, adesão, falhas…): o mesmo tooltip dos gráficos,
// preso ao topo da linha, e o fundo da linha destacado no hover. Use no lugar do <li>.
export function TipItem({ title, rows, foot, className = '', children }: { title?: React.ReactNode; rows: TipRow[]; foot?: React.ReactNode; className?: string; children: React.ReactNode }) {
  const tip = useChartTip();
  return <li className={cx(className, 'rounded-tight cursor-default transition-colors', tip.active != null && 'bg-surface-muted')} {...tip.target('row', anchorTop, () => <TipBody title={title} rows={rows} foot={foot} />)}>{children}{tip.node}</li>;
}

// ---------- séries: sólido/hachurado por token (classes em styles/base.css) ----------
export type SeriesFill = 'real' | 'real-hatch' | 'loss' | 'loss-hatch' | 'prev' | 'prev-hatch' | 'target' | 'cat-1' | 'cat-2' | 'cat-3' | 'cat-4';
export const FILL: Record<SeriesFill, string> = {
  real: 'fill-real', 'real-hatch': 'hatch-real', loss: 'fill-loss', 'loss-hatch': 'hatch-loss', prev: 'fill-prev', 'prev-hatch': 'hatch-prev', target: 'hatch-target',
  'cat-1': 'fill-cat-1', 'cat-2': 'fill-cat-2', 'cat-3': 'fill-cat-3', 'cat-4': 'fill-cat-4',
};
// escala categórica (no máximo 4): mesmo matiz, variando sólido/hachura/claro
export const CATS: SeriesFill[] = ['cat-1', 'cat-2', 'cat-3', 'cat-4'];

export function ChartLegend({ items }: { items: { kind: SeriesFill; label: string }[] }) {
  return <div className="flex flex-wrap gap-x-5 gap-y-tight text-caption text-ink-2">{items.map((i) => <span key={i.label} className="inline-flex items-center gap-tight"><span aria-hidden="true" className={cx('w-3 h-3 rounded-chip', FILL[i.kind])} />{i.label}</span>)}</div>;
}

// escala "bonita" para o eixo: 0, metade e topo arredondado
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export interface StackSeries { key: string; label: string; fill?: SeriesFill }
// Barras 100% horizontais, uma linha por item (ex.: faixas de RPM por veículo). O modo vertical saiu: use
// ColumnChart, CompareBars ou StackedColumns.
export function StackedBars({ data, series, format = (v: number) => String(v), percent = false, labelClass = '', right }: {
  data: { label: string; values: Record<string, number> }[]; series: StackSeries[]; prev?: (number | null)[];
  format?: (v: number) => string; height?: number; layout?: 'horizontal'; percent?: boolean; labelClass?: string;
  right?: (row: { label: string; values: Record<string, number> }, i: number) => React.ReactNode;
}) {
  const tip = useChartTip();
  const sr = series.slice(0, 4).map((s, i) => ({ ...s, fill: s.fill || CATS[i] }));
  const total = (r: any) => sr.reduce((a, s) => a + (r.values[s.key] || 0), 0);
  return (
    <figure className="m-0">
      <table className="sr-only">
        <thead><tr><th>Item</th>{sr.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{data.map((r, i) => <tr key={i}><th>{r.label}</th>{sr.map((s) => <td key={s.key}>{format(r.values[s.key] || 0)}</td>)}</tr>)}</tbody>
      </table>
      <ul aria-hidden="true" className="flex flex-col gap-1">
        {data.map((r, i) => {
          const t = total(r) || 1;
          return (
            <li key={i} className={cx('grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 py-1 -mx-2 px-2 rounded-tight cursor-default transition-colors', tip.active === i && 'bg-surface-muted')}
              {...tip.target(i, anchorTop, () => <TipBody title={r.label} rows={sr.map((s) => ({ swatch: <span aria-hidden="true" className={cx('w-2.5 h-2.5 rounded-swatch shrink-0', FILL[s.fill])} />, label: s.label, value: format(percent ? ((r.values[s.key] || 0) / t) * 100 : r.values[s.key] || 0) }))} />)}>
              <span className={cx('text-small truncate', labelClass)}>{r.label}</span>
              <span className="flex h-5 rounded-chip overflow-hidden bg-surface-muted grow-x" style={{ ['--i' as any]: i }}>
                {sr.map((s) => { const v = r.values[s.key] || 0; return v > 0 ? <span key={s.key} className={cx('h-full', FILL[s.fill])} style={{ width: `${(v / t) * 100}%` }} /> : null; })}
              </span>
              <span className="text-small num text-right min-w-[3rem]">{right ? right(r, i) : format(percent ? 100 : total(r))}</span>
            </li>
          );
        })}
      </ul>
      {tip.node}
    </figure>
  );
}
// =====================================================================================================
// Gráficos da Fase B (SVG próprio, medido em pixels reais para o texto não deformar).
// Regras de cor de dado: azul = realizado (a barra em destaque é sempre azul, boa ou ruim; o chip diz se é bom),
// azul claro = mesma série fora de destaque, rosa = perda ou desvio, hachura = anterior, estimado ou meta.
// Vermelho nunca aparece em gráfico. As cores de status só entram quando a série É um status (composição da frota).
// =====================================================================================================

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
const AXIS = { fontSize: 11, fill: 'var(--ink-3)', fontFamily: 'var(--font-sans)' } as const;
const VAL = { fontSize: 12, fill: 'var(--ink-2)', fontFamily: 'var(--font-sans)', fontWeight: 500 } as const;
const topRounded = (x: number, y: number, w: number, h: number, r = 6) => {
  if (h <= 0) return '';
  const k = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`;
};
// marcas do eixo em passos "redondos" (1, 2, 2,5, 5 × 10^n), cerca de 4 intervalos
function niceTicks(lo: number, hi: number, n = 4) {
  const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  const t0 = Math.ceil(lo / step) * step, out: number[] = [];
  for (let t = t0; t <= hi + step * 1e-6; t += step) out.push(+t.toFixed(10));
  return { ticks: out, top: Math.max(hi, out[out.length - 1]) };
}
// rótulos do eixo x: a cada `every`, sem encostar no último (que sempre aparece)
const showX = (i: number, n: number, every: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.6);
// Largura estimada de um texto em px (fonte da interface, algarismos tabulares ≈ 0,58 em por caractere).
// Serve para decidir quantos rótulos cabem e quanto espaço o eixo y precisa, sem medir o DOM a cada render.
const textW = (t: string, size = 11) => t.length * size * 0.58;
// margem esquerda que cabe o maior rótulo do eixo y (antes era fixa e cortava "R$ 40k")
const axisLeft = (labels: string[], min = 24) => Math.ceil(Math.max(min, ...labels.map((l) => textW(l) + 10)));
// de quantos em quantos rótulos mostrar para não se sobreporem num espaço de `slot` px cada
const stepFor = (labels: string[], slot: number, size = 11) => (slot <= 0 ? 1 : Math.max(1, Math.ceil((Math.max(0, ...labels.map((l) => textW(l, size))) + 8) / slot)));
// tabela escondida para leitor de tela (todo gráfico tem uma)
function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return <table className="sr-only"><caption>{caption}</caption><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody></table>;
}

// ---------- colunas mensais: meses anteriores em azul claro, o destaque (padrão: último) em azul; meta tracejada ----------
// floor: base do eixo (padrão 0). Para séries que vivem perto do topo (disponibilidade 95–100%), suba a base
// para as diferenças aparecerem; o rótulo de cada barra continua mostrando o valor real.
// good: direção boa da série, colore a variação no tooltip (sem ela, a variação fica neutra).
// onSelect: a barra vira botão (clique ou Enter escolhe o período, ex.: o mês do ranking ao lado); o destaque segue `highlight`.
export function ColumnChart({ data, highlight, format = (v: number) => String(v), height = 170, goal, label = 'Valor', showValues = true, floor = 0, good, onSelect }: {
  data: { label: string; value: number }[]; highlight?: number; format?: (v: number) => string; height?: number; goal?: { value: number; label?: string }; label?: string; showValues?: boolean; floor?: number; good?: 'up' | 'down'; onSelect?: (i: number) => void;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const tip = useChartTip();
  const hi = highlight ?? data.length - 1;
  const top = showValues ? 22 : 8, bottom = 22, H = height;
  const max = Math.max(floor + 1e-9, ...data.map((d) => d.value), goal?.value ?? 0);
  const span = (max - floor) * 1.04 || 1; // sem eixo: a maior barra quase encosta no topo
  const y = (v: number) => top + (H - top - bottom) * (1 - (Math.max(floor, v) - floor) / span);
  const slot = W / Math.max(1, data.length), bw = Math.min(44, slot * 0.62);
  // valores acima das barras: todos só quando o maior cabe no espaço de uma barra; senão, só o destaque
  const vals = data.map((d) => format(d.value));
  const allVals = showValues && Math.max(0, ...vals.map((v) => textW(v, 12))) + 4 <= slot;
  const every = stepFor(data.map((d) => d.label), slot);
  const goalText = goal ? goal.label ?? `Meta ${format(goal.value)}` : '';
  const vx = (i: number, x: number) => Math.min(W - textW(vals[i], 13) / 2, Math.max(textW(vals[i], 13) / 2, x));
  return (
    <figure className="m-0">
      <SrTable caption={label} head={['Período', label]} rows={data.map((d) => [d.label, format(d.value)])} />
      {/* rótulo da meta fora da área do gráfico: não disputa espaço com o valor da barra em destaque */}
      {goal && <p aria-hidden="true" className="flex items-center justify-end gap-tight text-caption font-semibold text-ink mb-1"><svg width="16" height="6"><line x1="0" x2="16" y1="3" y2="3" stroke="var(--ink-2)" strokeDasharray="3 3" strokeWidth="1.5" /></svg>{goalText}</p>}
      <div ref={ref} aria-hidden={onSelect ? undefined : true}>
        {W > 0 && <svg width={W} height={H} className="block overflow-visible">
          <line x1={0} x2={W} y1={H - bottom} y2={H - bottom} stroke="var(--line)" />
          {goal && <line x1={0} x2={W} y1={y(goal.value)} y2={y(goal.value)} stroke="var(--ink-2)" strokeDasharray="4 4" strokeWidth={1.25} />}
          {data.map((d, i) => {
            const x = i * slot + (slot - bw) / 2, on = i === hi, hov = tip.active === i;
            return <g key={i}>
              {hov && <rect x={i * slot + 2} y={0} width={slot - 4} height={H - bottom} rx={6} fill="var(--surface-muted)" />}
              <path d={topRounded(x, y(d.value), bw, H - bottom - y(d.value))} fill={on ? 'var(--real)' : hov ? 'var(--real-mid)' : 'var(--real-muted)'} className="grow-y transition-[fill] duration-100" style={{ ['--i' as any]: i }} />
              {showValues && (allVals || on || hov) && <text x={vx(i, x + bw / 2)} y={y(d.value) - 7} textAnchor="middle" {...VAL} {...(on ? { fill: 'var(--real)', fontWeight: 600, fontSize: 13 } : hov ? { fill: 'var(--ink)', fontWeight: 600 } : {})} stroke="var(--card)" strokeWidth={3} paintOrder="stroke">{vals[i]}</text>}
              {(showX(i, data.length, every) || on || hov) && <text x={x + bw / 2} y={H - 5} textAnchor="middle" {...AXIS} {...(on || hov ? { fill: 'var(--ink-2)', fontWeight: 600 } : {})}>{d.label}</text>}
              {(() => { const t = tip.target(i, () => anchorIn(ref.current, x + bw / 2, y(d.value)), () => (
                  <TipBody title={d.label} rows={[{ swatch: <Swatch color={on ? 'var(--real)' : 'var(--real-mid)'} />, label, value: vals[i], strong: true }, ...(goal ? [{ swatch: <Swatch color="var(--ink-2)" line dashed />, label: goalText.replace(/\s[\d.,]+.*$/, '') || 'Meta', value: format(goal.value), tone: 'muted' as const }] : [])]}
                    foot={i > 0 ? <>vs {data[i - 1].label}: {vals[i - 1]} · <DeltaText cur={d.value} prev={data[i - 1].value} good={good} /></> : onSelect ? 'Clique para escolher' : undefined} />
                ));
                return <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" className={onSelect ? 'cursor-pointer outline-none' : 'cursor-default'} {...t}
                  {...(onSelect ? { tabIndex: 0, role: 'button', 'aria-label': `${d.label}: ${vals[i]}`, onClick: (e: React.MouseEvent) => { onSelect(i); t.onClick(e); }, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); } } } : {})} />; })()}
            </g>;
          })}
        </svg>}
      </div>
      {tip.node}
    </figure>
  );
}

// ---------- atual × anterior: anterior hachurado ao lado do atual sólido, por grupo ----------
export function CompareBars({ groups, format = (v: number) => String(v), height = 190, curLabel = 'Atual', prevLabel = 'Anterior', good }: {
  groups: { label: string; cur: number; prev: number }[]; format?: (v: number) => string; height?: number; curLabel?: string; prevLabel?: string; good?: 'up' | 'down';
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const tip = useChartTip();
  const p = useId().replace(/:/g, '');
  const max = niceMax(Math.max(1, ...groups.flatMap((g) => [g.cur, g.prev])) * 1.05);
  const top = 22, bottom = 24, H = height, left = axisLeft([0, max / 2, max].map(format));
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const slot = (W - left) / Math.max(1, groups.length), bw = Math.min(46, slot * 0.26);
  // com muitos grupos as barras ficam finas: o valor do anterior sai (fica no tooltip) e os rótulos rareiam
  const showPrev = Math.max(0, ...groups.map((g) => textW(format(g.prev), 12))) <= bw + 6;
  const showCur = Math.max(0, ...groups.map((g) => textW(format(g.cur), 13))) <= slot / 2 + bw;
  const every = stepFor(groups.map((g) => g.label), slot, groups.length > 4 ? 11 : 13);
  return (
    <figure className="m-0">
      <figcaption className="mb-4 flex"><ChartLegend items={[{ kind: 'real-hatch', label: prevLabel }, { kind: 'real', label: curLabel }]} /></figcaption>
      <SrTable caption="Atual e anterior" head={['Grupo', prevLabel, curLabel]} rows={groups.map((g) => [g.label, format(g.prev), format(g.cur)])} />
      <div ref={ref} aria-hidden="true">
        {W > 0 && <svg width={W} height={H} className="block overflow-visible">
          {hatchDefs(p)}
          {[0, max / 2, max].map((t) => <g key={t}><line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-strong)' : 'var(--line)'} /><text x={left - 6} y={y(t) + 4} textAnchor="end" {...AXIS}>{format(t)}</text></g>)}
          {groups.map((g, i) => {
            const cx0 = left + i * slot + slot / 2, xp = cx0 - bw - 3, xc = cx0 + 3, hov = tip.active === i;
            return <g key={i}>
              {hov && <rect x={left + i * slot + 2} y={top - 18} width={slot - 4} height={H - bottom - top + 18} rx={6} fill="var(--surface-muted)" />}
              <path d={topRounded(xp, y(g.prev), bw, H - bottom - y(g.prev))} fill={`url(#${p}hatch-real)`} className="grow-y" style={{ ['--i' as any]: i * 2 }} />
              <path d={topRounded(xc, y(g.cur), bw, H - bottom - y(g.cur))} fill="var(--real)" className="grow-y" style={{ ['--i' as any]: i * 2 + 1 }} />
              {(showPrev || hov) && <text x={xp + bw / 2} y={y(g.prev) - 7} textAnchor="middle" {...VAL} stroke="var(--card)" strokeWidth={3} paintOrder="stroke">{format(g.prev)}</text>}
              {(showCur || hov || i === groups.length - 1) && <text x={Math.min(W - textW(format(g.cur), 13) / 2, xc + bw / 2)} y={y(g.cur) - 7} textAnchor="middle" {...VAL} fill="var(--real)" fontWeight={600} fontSize={13} stroke="var(--card)" strokeWidth={3} paintOrder="stroke">{format(g.cur)}</text>}
              {(showX(i, groups.length, every) || hov) && <text x={cx0} y={H - 5} textAnchor="middle" fontSize={groups.length > 4 ? 11 : 13} fill="var(--ink-2)" fontWeight={hov ? 600 : 400} fontFamily="var(--font-sans)">{g.label}</text>}
              <rect x={left + i * slot} y={0} width={slot} height={H} fill="transparent" className="cursor-default"
                {...tip.target(i, () => anchorIn(ref.current, cx0, Math.min(y(g.cur), y(g.prev))), () => (
                  <TipBody title={g.label} rows={[{ swatch: <Swatch color="var(--real)" />, label: curLabel, value: format(g.cur), strong: true }, { swatch: <Swatch color="" hatch />, label: prevLabel, value: format(g.prev), tone: 'muted' }]}
                    foot={g.prev ? <>Variação: <DeltaText cur={g.cur} prev={g.prev} good={good} /></> : undefined} />
                ))} />
            </g>;
          })}
        </svg>}
      </div>
      {tip.node}
    </figure>
  );
}

// ---------- colunas empilhadas: realizado (azul) + desvio (rosa); fora do destaque, tons claros ----------
export function StackedColumns({ data, series, highlight, format = (v: number) => String(v), height = 190 }: {
  data: { label: string; values: number[] }[]; series: { label: string; tone: 'real' | 'loss' }[]; highlight?: number; format?: (v: number) => string; height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const tip = useChartTip();
  const hi = highlight ?? data.length - 1;
  const tot = (r: { values: number[] }) => r.values.reduce((a, b) => a + b, 0);
  const max = niceMax(Math.max(1, ...data.map(tot)) * 1.05);
  const top = 22, bottom = 22, left = axisLeft([0, max / 2, max].map(format)), H = height;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const slot = (W - left) / Math.max(1, data.length), bw = Math.min(44, slot * 0.56);
  // total acima de cada coluna só quando cabe (30 dias não cabem); o destaque sempre mostra
  const allTot = Math.max(0, ...data.map((r) => textW(format(tot(r)), 12))) + 4 <= slot;
  const every = stepFor(data.map((r) => r.label), slot);
  const col = (tone: 'real' | 'loss', on: boolean) => (tone === 'real' ? (on ? 'var(--real)' : 'var(--real-mid)') : on ? 'var(--loss)' : 'var(--loss-muted)');
  return (
    <figure className="m-0">
      <figcaption className="mb-4 flex flex-wrap gap-x-5 gap-y-tight text-caption text-ink-2">{series.map((s) => <span key={s.label} className="inline-flex items-center gap-tight"><span aria-hidden="true" className="w-3 h-3 rounded-chip" style={{ background: col(s.tone, false) }} />{s.label}</span>)}</figcaption>
      <SrTable caption="Colunas empilhadas" head={['Período', ...series.map((s) => s.label), 'Total']} rows={data.map((r) => [r.label, ...r.values.map(format), format(tot(r))])} />
      <div ref={ref} aria-hidden="true">
        {W > 0 && <svg width={W} height={H} className="block overflow-visible">
          {[0, max / 2, max].map((t) => <g key={t}><line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-strong)' : 'var(--line)'} /><text x={left - 6} y={y(t) + 4} textAnchor="end" {...AXIS}>{format(t)}</text></g>)}
          {data.map((r, i) => {
            const x = left + i * slot + (slot - bw) / 2, hov = tip.active === i, on = i === hi || hov;
            let acc = 0;
            const last = r.values.reduce((k, v, j) => (v > 0 ? j : k), 0);
            return <g key={i}>
              {hov && <rect x={left + i * slot + 2} y={0} width={slot - 4} height={H - bottom} rx={6} fill="var(--surface-muted)" />}
              <g className="grow-y" style={{ ['--i' as any]: i }}>
                {r.values.map((v, j) => {
                  const y0 = y(acc), y1 = y(acc + v); acc += v;
                  if (v <= 0) return null;
                  return j === last ? <path key={j} d={topRounded(x, y1, bw, y0 - y1)} fill={col(series[j].tone, on)} /> : <rect key={j} x={x} y={y1} width={bw} height={y0 - y1} fill={col(series[j].tone, on)} />;
                })}
              </g>
              {(allTot || on) && <text x={Math.min(W - textW(format(tot(r)), 12) / 2, x + bw / 2)} y={y(tot(r)) - 7} textAnchor="middle" {...VAL} fill="var(--ink)" fontWeight={on ? 700 : 600} stroke="var(--card)" strokeWidth={3} paintOrder="stroke">{format(tot(r))}</text>}
              {(showX(i, data.length, every) || on) && <text x={x + bw / 2} y={H - 5} textAnchor="middle" {...AXIS}>{r.label}</text>}
              <rect x={left + i * slot} y={0} width={slot} height={H} fill="transparent" className="cursor-default"
                {...tip.target(i, () => anchorIn(ref.current, x + bw / 2, y(tot(r))), () => (
                  <TipBody title={r.label} rows={[...series.map((s, j) => ({ swatch: <Swatch color={col(s.tone, true)} />, label: s.label, value: format(r.values[j] || 0) })), { label: 'Total', value: format(tot(r)), strong: true }]}
                    foot={tot(r) ? series.map((s, j) => `${s.label} ${Math.round(((r.values[j] || 0) / tot(r)) * 100)}%`).join(' · ') : undefined} />
                ))} />
            </g>;
          })}
        </svg>}
      </div>
      {tip.node}
    </figure>
  );
}

// ---------- ranking horizontal: posição, item (placa em chip), barra e valor; o destaque em azul cheio ----------
export function RankBars({ items, format = (v: number) => String(v), highlight = 0, max }: { items: { label: string; value: number }[]; format?: (v: number) => string; highlight?: number; max?: number }) {
  const tip = useChartTip();
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, i) => a + i.value, 0);
  return (
    <ol className="flex flex-col gap-1">
      {items.map((it, i) => (
        <li key={it.label} className={cx('grid grid-cols-[1.25rem_minmax(0,6.5rem)_1fr_auto] items-center gap-3 h-9 px-2 rounded-tight cursor-default transition-colors', i === highlight ? 'bg-surface-muted' : tip.active === i && 'bg-card-2')}
          {...tip.target(i, anchorTop, () => <TipBody title={`${i + 1}º lugar`} rows={[{ label: it.label, value: format(it.value), strong: true }]} foot={total ? `${Math.round((it.value / total) * 100)}% do total · ${i === 0 ? 'líder' : `${format(items[0].value - it.value)} abaixo do 1º`}` : undefined} />)}>
          <span className="text-small text-ink-3 num">{i + 1}</span>
          <span className={cx('text-small truncate', isPlate(it.label) ? 'font-mono font-semibold' : 'font-medium')}>{it.label}</span>
          <span className="h-2.5 rounded-pill bg-track overflow-hidden"><span className="block h-full rounded-pill grow-x" style={{ width: `${(it.value / m) * 100}%`, background: i === highlight || tip.active === i ? 'var(--real)' : 'var(--real-mid)', ['--i' as any]: i }} /></span>
          <span className="text-small font-semibold num text-right min-w-[3.5rem]">{format(it.value)}</span>
        </li>
      ))}
      {tip.node}
    </ol>
  );
}

// ---------- barra 100%: partes de um todo, rótulo dentro quando cabe e legenda com faixa e percentual ----------
export type PartTone = 'real' | 'real-mid' | 'real-muted' | 'loss';
const PART_BG: Record<PartTone, string> = { real: 'var(--real)', 'real-mid': 'var(--real-mid)', 'real-muted': 'var(--real-muted)', loss: 'var(--loss)' };
export function Bar100({ parts, format = (v: number) => `${Math.round(v)}%` }: { parts: { label: string; value: number; tone: PartTone; detail?: string }[]; format?: (pct: number) => string }) {
  const tip = useChartTip();
  const t = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <figure className="m-0">
      <div className="flex h-12 rounded-ctl overflow-hidden gap-[2px] grow-x" role="img" aria-label={parts.map((p) => `${p.label}: ${format((p.value / t) * 100)}`).join('; ')}>
        {parts.map((p) => {
          const pct = (p.value / t) * 100, dark = p.tone === 'real' || p.tone === 'loss';
          return p.value > 0 ? <span key={p.label} className={cx('h-full flex items-center justify-center text-body font-semibold num cursor-default transition-opacity duration-100', tip.active != null && tip.active !== p.label && 'opacity-60')} style={{ width: `${pct}%`, background: PART_BG[p.tone], color: dark ? 'var(--on-dark)' : 'var(--ink)' }}
            {...tip.target(p.label, anchorTop, () => <TipBody title={p.label} rows={[{ swatch: <Swatch color={PART_BG[p.tone]} />, label: p.detail || 'Parte', value: format(pct), strong: true }]} />)}>{pct >= 12 ? format(pct) : ''}</span> : null;
        })}
      </div>
      <figcaption className="mt-3 flex flex-col gap-1">
        {parts.map((p) => <span key={p.label} className="flex items-center gap-2 text-small"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-pill shrink-0" style={{ background: PART_BG[p.tone] }} /><span className="text-ink">{p.label}</span>{p.detail && <span className="text-ink-2">{p.detail}</span>}<span className="ml-auto num text-ink-2">{format((p.value / t) * 100)}</span></span>)}
      </figcaption>
      {tip.node}
    </figure>
  );
}

// Índice do ponto mais perto do ponteiro, num eixo x de n pontos entre left e W - right
const nearest = (clientX: number, box: HTMLElement | null, left: number, inner: number, n: number) => {
  const r = box?.getBoundingClientRect(); if (!r || n < 1) return 0;
  return Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left - left) / (inner || 1)) * (n - 1))));
};

// ---------- linhas: atual em azul (com área e ponto final), anterior tracejado neutro; meta tracejada ----------
export type LineSeries = { label: string; values: (number | null)[]; tone: 'real' | 'prev' | 'loss'; area?: boolean };
export function LineChart({ labels, series, goal, format = (v: number) => String(v), height = 190, domain, tickEvery }: {
  labels: string[]; series: LineSeries[]; goal?: { value: number; label?: string }; format?: (v: number) => string; height?: number; domain?: [number, number]; tickEvery?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const tip = useChartTip();
  const gid = useId().replace(/:/g, '');
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null)).concat(goal ? [goal.value] : []);
  const lo = domain?.[0] ?? 0;
  const nt = niceTicks(lo, domain?.[1] ?? Math.max(1, ...all) * 1.05);
  const hi = domain?.[1] ?? nt.top;
  const ticks = nt.ticks.filter((t) => t >= lo && t <= hi);
  const top = 12, bottom = 22, left = axisLeft(ticks.map(format), 32), right = 10, H = height, n = labels.length;
  const x = (i: number) => left + (W - left - right) * (n <= 1 ? 0.5 : i / (n - 1));
  const y = (v: number) => top + (H - top - bottom) * (1 - (v - lo) / (hi - lo || 1));
  const every = Math.max(tickEvery ?? Math.ceil(n / 6), stepFor(labels, (W - left - right) / Math.max(1, n - 1)));
  const stroke = { real: 'var(--real)', prev: 'var(--target)', loss: 'var(--loss)' };
  const path = (vals: (number | null)[]) => vals.reduce((d, v, i) => (v == null ? d : d + `${d && vals[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`), '');
  const idx = typeof tip.active === 'number' ? tip.active : null;
  const at = (i: number) => { const vs = series.map((s) => s.values[i]).filter((v): v is number => v != null); return anchorIn(ref.current, x(i), vs.length ? y(Math.max(...vs)) : top); };
  const body = (i: number) => (
    <TipBody title={labels[i]} rows={[...series.map((s) => ({ swatch: <Swatch color={stroke[s.tone]} line dashed={s.tone === 'prev'} />, label: s.label, value: s.values[i] == null ? '—' : format(s.values[i]!), strong: s.tone !== 'prev', tone: s.tone === 'prev' ? 'muted' as const : undefined })), ...(goal ? [{ swatch: <Swatch color="var(--ink-2)" line dashed />, label: 'Meta', value: format(goal.value), tone: 'muted' as const }] : [])]}
      foot={series.length > 1 && series[0].values[i] != null && series[1].values[i] != null ? <>vs {series[1].label.toLowerCase()}: <DeltaText cur={series[0].values[i]!} prev={series[1].values[i]} /></> : undefined} />
  );
  const move = (e: React.PointerEvent | React.MouseEvent, pin: boolean) => { const i = nearest(e.clientX, ref.current, left, W - left - right, n); tip.show(i, at(i), body(i), pin); };
  return (
    <figure className="m-0">
      {series.length > 1 && <figcaption className="mb-3 flex flex-wrap justify-end gap-x-5 gap-y-tight text-caption text-ink-2">{series.map((s) => <span key={s.label} className="inline-flex items-center gap-tight"><svg width="18" height="8" aria-hidden="true"><line x1="1" x2="17" y1="4" y2="4" stroke={stroke[s.tone]} strokeWidth="2" strokeDasharray={s.tone === 'prev' ? '3 3' : undefined} /></svg>{s.label}</span>)}</figcaption>}
      <SrTable caption="Série" head={['Ponto', ...series.map((s) => s.label)]} rows={labels.map((l, i) => [l, ...series.map((s) => (s.values[i] == null ? '—' : format(s.values[i]!)))])} />
      <div ref={ref} aria-hidden="true">
        {W > 0 && <svg width={W} height={H} className="block overflow-visible">
          <defs><linearGradient id={`${gid}a`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--real)" stopOpacity="0.18" /><stop offset="1" stopColor="var(--real)" stopOpacity="0" /></linearGradient></defs>
          {ticks.map((t, k) => <g key={k}><line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={k === 0 ? 'var(--line-strong)' : 'var(--line)'} /><text x={left - 8} y={y(t) + 4} textAnchor="end" {...AXIS}>{format(t)}</text></g>)}
          {labels.map((l, i) => showX(i, n, every) && <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} {...AXIS}>{l}</text>)}
          {goal && <g>
            <line x1={left} x2={W - right} y1={y(goal.value)} y2={y(goal.value)} stroke="var(--ink-2)" strokeDasharray="4 4" strokeWidth={1.25} />
            <text x={W - right} y={y(goal.value) + 16 > H - bottom - 4 ? y(goal.value) - 6 : y(goal.value) + 16} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--ink)" stroke="var(--card)" strokeWidth={4} paintOrder="stroke">{goal.label ?? `Meta ${format(goal.value)}`}</text>
          </g>}
          {series.map((s, k) => {
            const d = path(s.values);
            const lastI = s.values.reduce((a: number, v, i) => (v != null ? i : a), -1);
            const firstI = s.values.findIndex((v) => v != null);
            return <g key={k}>
              {s.area && s.tone === 'real' && lastI > firstI && <path d={`${d}L${x(lastI)},${y(lo)}L${x(firstI)},${y(lo)}Z`} fill={`url(#${gid}a)`} />}
              <path d={d} fill="none" stroke={stroke[s.tone]} strokeWidth={s.tone === 'prev' ? 1.5 : 2} strokeDasharray={s.tone === 'prev' ? '4 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {s.tone === 'real' && lastI >= 0 && idx == null && <g><circle cx={x(lastI)} cy={y(s.values[lastI]!)} r={8} fill="var(--real)" fillOpacity={0.15} /><circle cx={x(lastI)} cy={y(s.values[lastI]!)} r={4} fill="var(--card)" stroke="var(--real)" strokeWidth={2} /></g>}
            </g>;
          })}
          {/* régua e pontos do índice sob o ponteiro */}
          {idx != null && idx < n && <g pointerEvents="none">
            <line x1={x(idx)} x2={x(idx)} y1={top} y2={H - bottom} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s, k) => s.values[idx] == null ? null : <circle key={k} cx={x(idx)} cy={y(s.values[idx]!)} r={4.5} fill="var(--card)" stroke={stroke[s.tone]} strokeWidth={2} />)}
          </g>}
          <rect x={left} y={0} width={Math.max(0, W - left - right)} height={H - bottom} fill="transparent" className="cursor-crosshair" data-chart-hit=""
            onPointerMove={(e) => e.pointerType === 'mouse' && move(e, false)} onPointerLeave={(e) => e.pointerType === 'mouse' && tip.hide()} onClick={(e) => { e.stopPropagation(); move(e, true); }} />
        </svg>}
      </div>
      {tip.node}
    </figure>
  );
}

// ---------- área com projeção: acumulado realizado (área azul), projeção tracejada até o fim e o orçamento ----------
export function ProjectionChart({ labels, actual, projected, budget, format = (v: number) => String(v), height = 200, tickEvery }: {
  labels: string[]; actual: number[]; projected: number; budget?: { value: number; label?: string }; format?: (v: number) => string; height?: number; tickEvery?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const tip = useChartTip();
  const gid = useId().replace(/:/g, '');
  const n = labels.length, last = actual.length - 1;
  const nt = niceTicks(0, Math.max(1, projected, budget?.value ?? 0, ...actual) * 1.08);
  const hi = nt.top;
  const top = 26, bottom = 22, left = axisLeft(nt.ticks.map(format), 40), right = 12, H = height;
  const x = (i: number) => left + (W - left - right) * (i / Math.max(1, n - 1));
  const y = (v: number) => top + (H - top - bottom) * (1 - v / hi);
  const every = Math.max(tickEvery ?? Math.ceil(n / 6), stepFor(labels, (W - left - right) / Math.max(1, n - 1)));
  const d = actual.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const diff = budget ? budget.value - projected : 0, under = diff >= 0;
  const tag = budget ? `${format(Math.abs(diff))} ${under ? 'abaixo' : 'acima'}` : '';
  const tagW = textW(tag, 12) + 16;
  // valor no índice i: realizado até hoje; depois, a reta da projeção
  const valAt = (i: number) => (i <= last ? actual[i] : actual[last] + ((projected - actual[last]) * (i - last)) / Math.max(1, n - 1 - last));
  const idx = typeof tip.active === 'number' ? tip.active : null;
  const body = (i: number) => (
    <TipBody title={labels[i]} rows={[{ swatch: <Swatch color="var(--real)" line dashed={i > last} />, label: i <= last ? 'Acumulado' : 'Projeção', value: format(valAt(i)), strong: true }, ...(budget ? [{ swatch: <Swatch color="var(--target)" line dashed />, label: 'Orçamento', value: format(budget.value), tone: 'muted' as const }] : [])]}
      foot={budget ? `${format(Math.abs(budget.value - valAt(i)))} ${budget.value >= valAt(i) ? 'abaixo' : 'acima'} do orçamento` : undefined} />
  );
  const move = (e: React.PointerEvent | React.MouseEvent, pin: boolean) => { const i = nearest(e.clientX, ref.current, left, W - left - right, n); tip.show(i, anchorIn(ref.current, x(i), y(valAt(i))), body(i), pin); };
  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap justify-end gap-x-5 gap-y-tight text-caption text-ink-2">
        <span className="inline-flex items-center gap-tight"><svg width="18" height="8" aria-hidden="true"><line x1="1" x2="17" y1="4" y2="4" stroke="var(--real)" strokeWidth="2" /></svg>Realizado</span>
        <span className="inline-flex items-center gap-tight"><svg width="18" height="8" aria-hidden="true"><line x1="1" x2="17" y1="4" y2="4" stroke="var(--real)" strokeWidth="2" strokeDasharray="3 3" /></svg>Projeção</span>
        {budget && <span className="inline-flex items-center gap-tight"><svg width="18" height="8" aria-hidden="true"><line x1="1" x2="17" y1="4" y2="4" stroke="var(--target)" strokeWidth="2" strokeDasharray="3 3" /></svg>Orçamento</span>}
      </figcaption>
      <SrTable caption="Acumulado e projeção" head={['Ponto', 'Acumulado']} rows={[...actual.map((v, i) => [labels[i], format(v)]), ['Projeção no fim', format(projected)], ...(budget ? [['Orçamento', format(budget.value)]] : [])]} />
      <div ref={ref} aria-hidden="true">
        {W > 0 && last >= 0 && <svg width={W} height={H} className="block overflow-visible">
          <defs><linearGradient id={`${gid}a`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--real)" stopOpacity="0.2" /><stop offset="1" stopColor="var(--real)" stopOpacity="0" /></linearGradient></defs>
          {nt.ticks.map((t, k) => <g key={k}><line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={k === 0 ? 'var(--line-strong)' : 'var(--line)'} /><text x={left - 8} y={y(t) + 4} textAnchor="end" {...AXIS}>{format(t)}</text></g>)}
          {labels.map((l, i) => showX(i, n, every) && <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} {...AXIS}>{l}</text>)}
          {budget && <g>
            <line x1={left} x2={W - right} y1={y(budget.value)} y2={y(budget.value)} stroke="var(--target)" strokeDasharray="4 4" />
            <circle cx={x(n - 1)} cy={y(budget.value)} r={4} fill="var(--card)" stroke="var(--ink-2)" strokeWidth={1.5} />
            <text x={W - right} y={y(budget.value) - 10} textAnchor="end" fontSize={12} fill="var(--ink-2)" fontFamily="var(--font-sans)">{budget.label ?? `Orçamento ${format(budget.value)}`}</text>
          </g>}
          <path d={`${d}L${x(last)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${gid}a)`} />
          <path d={d} fill="none" stroke="var(--real)" strokeWidth={2} strokeLinejoin="round" />
          <line x1={x(last)} y1={y(actual[last])} x2={x(n - 1)} y2={y(projected)} stroke="var(--real)" strokeWidth={1.75} strokeDasharray="4 4" />
          <line x1={x(last)} x2={x(last)} y1={y(actual[last])} y2={y(0)} stroke="var(--real)" strokeOpacity={0.35} strokeDasharray="2 3" />
          <circle cx={x(n - 1)} cy={y(projected)} r={4} fill="var(--card)" stroke="var(--real)" strokeWidth={2} />
          <circle cx={x(last)} cy={y(actual[last])} r={4.5} fill="var(--real)" stroke="var(--card)" strokeWidth={2} />
          {budget && idx == null && <g transform={`translate(${Math.max(left, Math.min(W - right - tagW, x(last) - tagW / 2))},${Math.max(0, y(actual[last]) - 32)})`}>
            <rect width={tagW} height={22} rx={6} fill={under ? 'var(--real)' : 'var(--loss-ink)'} />
            <text x={tagW / 2} y={15} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--on-dark)" fontFamily="var(--font-sans)">{tag}</text>
          </g>}
          {idx != null && <g pointerEvents="none">
            <line x1={x(idx)} x2={x(idx)} y1={top} y2={H - bottom} stroke="var(--ink-3)" strokeDasharray="3 3" />
            <circle cx={x(idx)} cy={y(valAt(idx))} r={4.5} fill="var(--card)" stroke="var(--real)" strokeWidth={2} />
          </g>}
          <rect x={left} y={0} width={Math.max(0, W - left - right)} height={H - bottom} fill="transparent" className="cursor-crosshair" data-chart-hit=""
            onPointerMove={(e) => e.pointerType === 'mouse' && move(e, false)} onPointerLeave={(e) => e.pointerType === 'mouse' && tip.hide()} onClick={(e) => { e.stopPropagation(); move(e, true); }} />
        </svg>}
      </div>
      {tip.node}
    </figure>
  );
}

// ---------- gauge: meio círculo com o valor em azul e o traço da meta ----------
export function Gauge({ value, goal, unit = '%', digits = 1, label, max = 100, size = 240 }: { value: number; goal?: number; unit?: string; digits?: number; label?: string; max?: number; size?: number }) {
  const tip = useChartTip();
  const r = size / 2 - 14, cx0 = size / 2, cy0 = size / 2 + 4, sw = 16;
  const pt = (v: number, rr = r) => { const a = Math.PI * (1 - Math.max(0, Math.min(1, v / max))); return [cx0 + rr * Math.cos(a), cy0 - rr * Math.sin(a)]; };
  const arc = (v: number) => { const [x1, y1] = pt(0), [x2, y2] = pt(v); return `M${x1},${y1}A${r},${r} 0 0 1 ${x2},${y2}`; };
  const fmtV = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const box = useRef<HTMLDivElement>(null);
  return (
    <figure className="m-0 flex flex-col items-center">
      <div ref={box} className="relative" style={{ width: size, height: size / 2 + 24 }}>
        <svg width={size} height={size / 2 + 24} className="block overflow-visible" role="img" aria-label={`${label ?? 'Valor'}: ${fmtV(value)}${unit}${goal != null ? `, meta ${fmtV(goal)}${unit}` : ''}`}>
          <path d={arc(max)} fill="none" stroke="var(--track)" strokeWidth={sw} strokeLinecap="round" />
          <path d={arc(value)} fill="none" stroke="var(--real)" strokeWidth={tip.active ? sw + 3 : sw} strokeLinecap="round" className="cursor-default transition-[stroke-width] duration-100"
            {...tip.target('v', () => { const [px, py] = pt(value); return anchorIn(box.current, px, py - sw / 2); }, () => <TipBody title={label ?? 'Valor'} rows={[{ swatch: <Swatch color="var(--real)" />, label: 'Atual', value: `${fmtV(value)}${unit}`, strong: true }, ...(goal != null ? [{ label: 'Meta', value: `${fmtV(goal)}${unit}`, tone: 'muted' as const }] : [])]} foot={goal != null ? `${fmtV(Math.abs(value - goal))}${unit === '%' ? ' p.p.' : unit} ${value >= goal ? 'acima' : 'abaixo'} da meta` : undefined} />)} />
          {goal != null && (() => { const [a1, b1] = pt(goal, r - sw / 2 - 4), [a2, b2] = pt(goal, r + sw / 2 + 6); const right = goal / max > 0.5; return <g pointerEvents="none"><line x1={a1} y1={b1} x2={a2} y2={b2} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" /><text x={a2} y={Math.min(b1, b2) - 8} textAnchor={right ? 'end' : 'start'} fontSize={12} fontWeight={600} fill="var(--ink)" fontFamily="var(--font-sans)">Meta {goal.toLocaleString('pt-BR', { maximumFractionDigits: digits })}{unit}</text></g>; })()}
        </svg>
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center pointer-events-none">
          <Num value={value} unit={unit} digits={digits} size="kpi" count />
          {label && <span className="text-small text-ink-2 mt-hair">{label}</span>}
        </div>
      </div>
      {tip.node}
    </figure>
  );
}

// ---------- donut: composição de um todo, com total no centro e legenda (valor e %) ----------
// color: token CSS da parte. Composição de status usa as cores de status (é a mesma informação do mapa).
// Hover pela posição do ponteiro no anel (ângulo), não pelo traço: as fatias são arcos tracejados de um círculo.
export function Donut({ parts, center, centerLabel, size = 168, thickness = 20 }: { parts: { label: string; value: number; color: string; kind?: StatusKind }[]; center?: React.ReactNode; centerLabel?: string; size?: number; thickness?: number }) {
  const tip = useChartTip();
  const t = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = size / 2 - thickness / 2, C = 2 * Math.PI * r, gap = parts.filter((p) => p.value > 0).length > 1 ? 2.5 : 0;
  let acc = 0;
  const pct = (v: number) => `${Math.round((v / t) * 100)}%`;
  const box = useRef<HTMLDivElement>(null);
  const partAt = (e: React.PointerEvent | React.MouseEvent) => {
    const b = box.current!.getBoundingClientRect(); const dx = e.clientX - b.left - size / 2, dy = e.clientY - b.top - size / 2;
    const dist = Math.hypot(dx, dy); if (dist < r - thickness / 2 - 4 || dist > r + thickness / 2 + 4) return -1;
    const ang = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360; // 0° no topo, sentido horário
    let a = 0; for (let i = 0; i < parts.length; i++) { a += (parts[i].value / t) * 360; if (ang <= a) return i; } return parts.length - 1;
  };
  const swatchOf = (p: (typeof parts)[number]) => (p.kind ? <StatusGlyph kind={p.kind} /> : <Swatch color={p.color} />);
  const showPart = (i: number, pin: boolean) => {
    const p = parts[i]; const mid = parts.slice(0, i).reduce((a, q) => a + q.value, 0) + p.value / 2;
    const ang = (mid / t) * 2 * Math.PI - Math.PI / 2;
    tip.show(i, anchorIn(box.current, size / 2 + r * Math.cos(ang), size / 2 + r * Math.sin(ang) - thickness / 2), <TipBody title={p.label} rows={[{ swatch: swatchOf(p), label: 'Quantidade', value: p.value.toLocaleString('pt-BR'), strong: true }, { label: 'Do total', value: pct(p.value), tone: 'muted' }]} />, pin);
  };
  const act = typeof tip.active === 'number' ? tip.active : null;
  return (
    <figure className="m-0 flex flex-wrap items-center gap-6">
      <div ref={box} className="relative shrink-0" style={{ width: size, height: size }} data-chart-hit=""
        onPointerMove={(e) => { if (e.pointerType !== 'mouse') return; const i = partAt(e); if (i < 0) tip.hide(); else if (i !== act) showPart(i, false); }}
        onPointerLeave={(e) => e.pointerType === 'mouse' && tip.hide()} onClick={(e) => { e.stopPropagation(); const i = partAt(e); if (i >= 0) showPart(i, true); else tip.hide(true); }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={parts.map((p) => `${p.label}: ${p.value} (${pct(p.value)})`).join('; ')} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={thickness} />
          {parts.map((p, i) => {
            const len = (p.value / t) * C, off = acc; acc += len;
            if (p.value <= 0) return null;
            const dashed = p.kind === 'nosignal';
            return <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={act === i ? thickness + 4 : thickness} strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-off} opacity={act != null && act !== i ? 0.35 : dashed ? 0.55 : 1} className="transition-[opacity,stroke-width] duration-100" />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">{center}{centerLabel && <span className="text-small text-ink-2">{centerLabel}</span>}</div>
      </div>
      <figcaption className="flex-1 min-w-[180px] flex flex-col gap-1">
        {parts.map((p, i) => <span key={p.label} className={cx('grid grid-cols-[12px_minmax(0,1fr)_auto_3rem] items-center gap-2 text-small px-tight py-1 -mx-2 rounded-tight cursor-default', act === i && 'bg-surface-muted')}
          onPointerEnter={(e) => e.pointerType === 'mouse' && showPart(i, false)} onPointerLeave={(e) => e.pointerType === 'mouse' && tip.hide()}>
          {p.kind ? <StatusGlyph kind={p.kind} /> : <span aria-hidden="true" className="w-2.5 h-2.5 rounded-pill" style={{ background: p.color }} />}
          <span className="text-ink">{p.label}</span><span className="num font-semibold text-right">{p.value.toLocaleString('pt-BR')}</span><span className="num text-ink-2 text-right">{pct(p.value)}</span>
        </span>)}
      </figcaption>
      {tip.node}
    </figure>
  );
}

// ---------- anel de progresso: uma parte de um todo (disponibilidade), azul sobre o trilho ----------
export function Ring({ value, size = 168, thickness = 18, center, centerLabel, label }: { value: number; size?: number; thickness?: number; center?: React.ReactNode; centerLabel?: string; label?: string }) {
  const tip = useChartTip();
  const v = Math.max(0, Math.min(1, value)), r = size / 2 - thickness / 2, C = 2 * Math.PI * r;
  const fmt = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString('pt-BR')}%`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`${label ?? 'Progresso'}: ${fmt(v)}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--real)" strokeWidth={tip.active ? thickness + 3 : thickness} strokeLinecap="round" strokeDasharray={`${v * C} ${C}`} className="progress-fill cursor-default transition-[stroke-width] duration-100"
          {...tip.target('v', anchorTop, () => <TipBody title={label ?? 'Progresso'} rows={[{ swatch: <Swatch color="var(--real)" />, label: 'Parte', value: fmt(v), strong: true }, { swatch: <Swatch color="var(--track)" />, label: 'Restante', value: fmt(1 - v), tone: 'muted' }]} />)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">{center}{centerLabel && <span className="text-small text-ink-2">{centerLabel}</span>}</div>
      {tip.node}
    </div>
  );
}
