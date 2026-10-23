// Registro de saída/entrada da portaria: usado na aba Portaria de Viagens e na tela do perfil Portaria (celular).
// A portaria abre e fecha a viagem de pátio. NO PRODUTO REAL isto vira uma chamada ao backend.
import { useStore, assetKm } from './store';
import { registerOdometer } from './odometer';
import { gateError } from '@localle/shared/trips';
import { uid, DAY } from '@localle/shared/utils';

export interface GateInput { assetId: string; kind: 'saida' | 'entrada'; driverId: string; km: number; photo?: string; returnBy?: string; by: string }

// devolve a mensagem de erro, ou '' se registrou
export function registerGate(f: GateInput): string {
  const s = useStore.getState();
  const err = gateError(s, f.assetId, f.kind); if (err) return err;
  const last = Math.round(assetKm(s, f.assetId) || 0);
  if (f.km && last && f.km < last - 5) return `O odômetro informado (${f.km.toLocaleString('pt-BR')} km) é menor que o último registrado (${last.toLocaleString('pt-BR')} km). Confira o painel.`;
  const now = Date.now();
  const base = s.fences.find((x: any) => x.startsTrip && s.vehicles[f.assetId]?.inside?.includes(x.id)) || s.fences.find((x: any) => x.startsTrip);
  let returnBy: number | undefined;
  if (f.kind === 'saida' && f.returnBy) { const [h, m] = f.returnBy.split(':').map(Number); const rb = new Date(); rb.setHours(h, m, 0, 0); returnBy = rb.getTime() < now ? rb.getTime() + DAY : rb.getTime(); }
  s.upsert('gateLog', { id: uid('gt'), ts: now, assetId: f.assetId, driverId: f.driverId, kind: f.kind, km: f.km || 0, photo: f.photo || '', by: f.by, baseId: base?.id, ...(returnBy ? { returnBy } : {}) });
  if (f.km) registerOdometer(f.assetId, f.km, 'portaria', f.by);
  const open = s.trips.find((t: any) => t.assetId === f.assetId && t.status === 'em_andamento');
  if (f.kind === 'saida' && !open) s.upsert('trips', { type: 'patio', assetId: f.assetId, driverId: f.driverId, originFenceId: base?.id, status: 'em_andamento', startedAt: now, startSource: 'porteiro', stops: [], visited: [] });
  if (f.kind === 'entrada' && open?.type === 'patio') s.upsert('trips', { id: open.id, status: 'concluida', endedAt: now, endFenceId: base?.id });
  return '';
}
