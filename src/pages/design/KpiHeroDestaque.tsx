// DEMONSTRAÇÃO ISOLADA — variante do card de destaque (KpiHero) com a seção "Leitura da frota" na
// superfície de marca. Não substitui nem altera src/components/story.tsx: é uma anatomia à parte,
// para aprovação visual antes de qualquer migração ao componente de produção (ver briefing, regra 3).
//
// Reaproveita exatamente os tokens do card de dica (TipCard, ui.tsx): --brand-tip / --brand-tip-line,
// já calculados com fallback grafite em lib/brand.ts (brandVars). Não usa azul fixo nem hex no componente.
import React from 'react';
import { CardHeader, RouteMotif } from '../../components/ui';
import { Num, DeltaChip } from '../../components/story';

export interface KpiHeroDestaqueProps {
  title: string;
  period?: string;
  value: number;
  unit?: string;
  digits?: number;
  delta?: { value: number; unit?: string; good?: 'up' | 'down' };
  goal?: { value: number; label: string };
  scale?: [number, number];
  leituraDaFrota: React.ReactNode; // frase de leitura, vai na superfície de marca
}

// Mesma barra de meta do KpiHero de produção (posição do valor numa escala), reconstruída aqui só
// para a demonstração ficar visualmente completa sem importar internals não exportados.
function GoalBar({ value, goal, scale }: { value: number; goal: { value: number; label: string }; scale: [number, number] }) {
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - scale[0]) / (scale[1] - scale[0])) * 100))}%`;
  return (
    <div className="mt-kpi-chart">
      <div className="relative h-2.5 rounded-pill bg-track">
        <div className="absolute inset-y-0 left-0 rounded-pill bg-real" style={{ width: pos(value) }} />
        <div className="absolute -top-1.5 -bottom-1.5 w-[2px] bg-ink rounded-pill" style={{ left: `calc(${pos(goal.value)} - 1px)` }} aria-hidden="true" />
      </div>
      <div className="relative h-5 mt-tight text-caption text-ink-2 num">
        <span className="absolute left-0">{scale[0]}</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap font-medium text-ink" style={{ left: pos(goal.value) }}>{goal.label}</span>
        <span className="absolute right-0">{scale[1]}</span>
      </div>
    </div>
  );
}

export function KpiHeroDestaque({ title, period, value, unit, digits = 1, delta, goal, scale = [0, 100], leituraDaFrota }: KpiHeroDestaqueProps) {
  return (
    <section className="bg-card rounded-card p-card bleed-card flex flex-col min-w-0">
      {/* superfície analítica: permanece branca, igual ao card comum */}
      <CardHeader title={title} subtitle={period} className="mb-kpi-title" />
      <div className="flex flex-wrap items-baseline gap-x-grid gap-y-tight [container-type:inline-size]">
        <Num value={value} unit={unit} digits={digits} size="display" />
        {delta && <DeltaChip {...delta} />}
      </div>
      {goal && <GoalBar value={value} goal={goal} scale={scale} />}
      {/* única seção na cor de marca do card: mesma superfície do card de dica (TipCard), com fallback grafite */}
      <div className="mt-kpi-chart bg-brand-tip border border-brand-tip-line rounded-ctl p-card-sm flex items-start gap-stack">
        <span className="ico-line text-body shrink-0"><RouteMotif /></span>
        <div className="text-small text-ink leading-snug">{leituraDaFrota}</div>
      </div>
    </section>
  );
}
