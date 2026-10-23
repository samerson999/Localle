// DEMONSTRAÇÃO ISOLADA — barra divergente para ranking com polaridade contextual.
// Vive só em src/pages/design/. Reaproveita, só leitura, o tooltip e os tokens de dado já usados
// pelos gráficos de produção (src/components/chartTip.tsx) — não altera nenhum componente existente.
//
// Regra do briefing: posição geométrica (esquerda/centro/direita = abaixo/na/acima da meta) e cor
// semântica (favorável/desfavorável/neutro) são dimensões independentes. A cor nunca é a única pista:
// cada barra também mostra o valor, a meta e o desvio em texto.
import React from 'react';
import { useChartTip, anchorTop, TipBody, Swatch } from '../../components/chartTip';
import { evaluateMetric, type MetricContract } from './metricPolarity';

export interface DivergentBarRow {
  key: string;
  label: string;
  value: number;
  goal: number;
}

// escala compartilhada entre todos os itens comparados: o maior desvio absoluto do conjunto define
// o teto de cada lado, para as barras serem comparáveis entre si (não cada uma com sua própria escala)
function sharedScale(rows: DivergentBarRow[]) {
  return Math.max(1e-9, ...rows.map((r) => Math.abs(r.value - r.goal)));
}

export function DivergentBars({ contract, rows, format }: { contract: MetricContract; rows: DivergentBarRow[]; format: (v: number) => string }) {
  const tip = useChartTip();
  const scale = sharedScale(rows);
  const COLOR = { favoravel: 'var(--real)', desfavoravel: 'var(--loss)', neutro: 'var(--target)' } as const;
  return (
    <ol className="flex flex-col gap-2">
      <li aria-hidden="true" className="grid grid-cols-[minmax(0,8rem)_1fr_7rem] items-center gap-3 text-caption text-ink-3 px-2">
        <span />
        <span className="relative h-4"><span className="absolute left-1/2 -translate-x-1/2">Meta</span></span>
        <span className="text-right">Valor · desvio</span>
      </li>
      {rows.map((r) => {
        const ev = evaluateMetric(contract, { value: r.value, goal: r.goal });
        const pct = Math.min(50, (Math.abs(r.value - r.goal) / scale) * 50);
        const side: 'left' | 'right' | 'center' = r.value === r.goal ? 'center' : r.value < r.goal ? 'left' : 'right';
        const color = COLOR[ev.polarity];
        const deltaTxt = `${r.value > r.goal ? '+' : r.value < r.goal ? '−' : '±'}${format(Math.abs(r.value - r.goal))}`;
        return (
          <li key={r.key} className="grid grid-cols-[minmax(0,8rem)_1fr_7rem] items-center gap-3 py-tight px-2 -mx-2 rounded-tight cursor-default transition-colors" aria-label={`${r.label}: ${format(r.value)}, meta ${format(r.goal)}, ${ev.reason}`}
            {...tip.target(r.key, anchorTop, () => (
              <TipBody title={r.label} rows={[
                { swatch: <Swatch color={color} />, label: 'Valor', value: format(r.value), strong: true },
                { label: 'Meta', value: format(r.goal), tone: 'muted' },
                { label: 'Desvio', value: deltaTxt },
              ]} foot={ev.reason} />
            ))}>
            <span className="text-small font-medium truncate">{r.label}</span>
            <span className="relative h-5 rounded-pill bg-surface-muted">
              <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
              {side !== 'center' && (
                <span className="absolute inset-y-0 rounded-pill" style={{
                  background: color,
                  left: side === 'left' ? `${50 - pct}%` : '50%',
                  width: `${pct}%`,
                }} />
              )}
            </span>
            <span className="text-right text-small num whitespace-nowrap">
              <span className="font-semibold">{format(r.value)}</span>{' '}
              <span style={{ color: ev.polarity === 'neutro' ? 'var(--ink-2)' : color }}>{deltaTxt}</span>
            </span>
          </li>
        );
      })}
      {tip.node}
    </ol>
  );
}
