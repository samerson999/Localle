import type { ReactNode } from 'react';
import { NavTabs, PageHeader } from './ui';

const T = [
  { to: '/monitoramento', label: 'Mapa ao vivo', end: true },
  { to: '/monitoramento/replay', label: 'Replay' },
  { to: '/monitoramento/cercas', label: 'Cercas' },
];

// Abas do monitoramento: usa o controle segmentado compartilhado (NavTabs em ui.tsx),
// mesmo indicador deslizante azul (--brand-fill) do seletor por estado (Tabs).
export default function MonitorTabs() {
  return <NavTabs tabs={T} />;
}

// Cabeçalho das telas ao vivo: título discreto (PageHeader) e, numa linha à parte, abas e ações. Sem seletor de período.
// Proximidade: título → 40 (--page-head) → abas → 16 → conteúdo. As abas são do conteúdo, não do cabeçalho.
export function MonitorHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <PageHeader icon="monitoramento" title={title} subtitle={subtitle} />
      <div className="flex flex-wrap items-center gap-tight mb-card-head">
        <MonitorTabs />
        {children}
      </div>
    </>
  );
}
