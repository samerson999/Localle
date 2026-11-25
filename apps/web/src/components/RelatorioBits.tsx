// Peças repetidas nas telas de relatório (Posições, Uso da frota, Velocidade, Cercas, Passou por aqui).
import { Card } from './ui';
import { Icon, type IconName } from './icons';

export function StatTile({ icon, value, label, sub }: { icon: IconName; value: React.ReactNode; label: string; sub: string }) {
  return (
    <Card dense>
      <div className="flex items-center gap-stack">
        <span className="w-10 h-10 rounded-ctl bg-brand-soft flex items-center justify-center shrink-0 text-brand-ink"><Icon name={icon} size={20} /></span>
        <div className="min-w-0">
          <p className="text-h3 font-semibold num"><span>{value}</span> <span className="text-small font-normal text-ink-2">{label}</span></p>
          <p className="text-caption text-ink-2 truncate">{sub}</p>
        </div>
      </div>
    </Card>
  );
}

/** Busca do relatório, aplicada a todo o relatório (números, tabelas, mapa e arquivo exportado). */
export function BuscaChip({ busca }: { busca: string }) {
  const b = busca.trim();
  return b ? <span className="flex items-center gap-tight text-small text-ink"><Icon name="busca" size={16} className="text-ink-2" />“{b}”</span> : null;
}
