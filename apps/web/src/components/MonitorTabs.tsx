import type { ReactNode } from 'react';
import { PageHeader } from './ui';

// Cabeçalho das telas ao vivo (Monitoramento, Replay, Cercas, Alertas): sem o nome da tela à vista (PageHeader) e sem
// abas — desde 04/11/2026 Replay e Cercas são páginas próprias, na árvore do menu sob Monitoramento. As ações ocupam
// a linha do cabeçalho, a 16 do conteúdo que controlam. Sem seletor de período.
export function MonitorHeader({ title, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="[&>header]:mb-card-head">
      <PageHeader title={title}>{children}</PageHeader>
    </div>
  );
}
