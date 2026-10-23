import { useStore } from '../lib/store';
import { isOut, setIncludeRetired } from '../lib/assetLifecycle';
import { Check } from './ui';

// "Incluir inativos" (vendidos e baixados) nas telas operacionais; só aparece se houver algum. Vale em todos os módulos.
export function RetiredToggle() {
  const n = useStore((s) => s.assets.filter(isOut).length);
  const on = useStore((s) => !!s.includeRetired);
  if (!n && !on) return null;
  return <span title="Veículos vendidos ou baixados. Vale em todos os módulos."><Check label={`Incluir inativos (${n})`} checked={on} onChange={setIncludeRetired} /></span>;
}
