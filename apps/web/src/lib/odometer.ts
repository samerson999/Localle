// Leituras de odômetro e instalação do rastreador, guardadas no navegador.
// No produto real estas regras ficam no backend: as funções SQL de referência estão em docs/especificacao-sql/
// (fn_install_tracker, fn_check_odometer, fn_register_odometer em 20261017200000_instalacao.sql).
import { create } from 'zustand';
import { useStore, assetKm } from './store';
import { uid } from '@localle/shared/utils';

// Pergunta única após a instalação: o primeiro lançamento manual diverge muito do km calculado?
export const useOdoAsk = create<{ ask: null | { assetId: string; informed: number; expected: number } }>(() => ({ ask: null }));
const MANUAL_SOURCES = ['abastecimento', 'checklist', 'portaria', 'os'];
function checkDivergence(assetId: string, km: number, source: string) {
  const s = useStore.getState();
  const a = s.assets.find((x: any) => x.id === assetId);
  if (!a?.installation || a.odometerCheckDone || !MANUAL_SOURCES.includes(source)) return;
  const expected = Math.round(assetKm(s, assetId));
  s.upsert('assets', { id: assetId, odometerCheckDone: true });
  if (Math.abs(km - expected) > Math.max(500, expected * 0.03)) useOdoAsk.setState({ ask: { assetId, informed: km, expected } });
}

// Leitura manual (abastecimento, checklist, portaria, OS, instalação)
export function registerOdometer(assetId: string, km: number, source: string, by?: string, photo?: string) {
  checkDivergence(assetId, km, source);
  useStore.getState().upsert('odometerReadings', { id: uid('od'), assetId, km, source, by, photo, ts: Date.now() });
}

export function applyOdometerCorrection(assetId: string, km: number) {
  const s = useStore.getState();
  const v = s.vehicles[assetId];
  s.upsert('assets', { id: assetId, kmOffset: Math.round(km - (v?.odometer || 0)) });
  registerOdometer(assetId, km, 'ajuste', s.session?.name || 'Gestor');
}

// Vínculo do rastreador com os dados da instalação (odômetro inicial, foto e técnico)
export function linkTrackerWithInstall(assetId: string, tracker: any, inst: { initialKm: number | null; photo: string; technician: string; kmCalculated: boolean; installedAt: number }) {
  const st = useStore.getState();
  st.linkTracker(assetId, tracker);
  const v = useStore.getState().vehicles[assetId];
  const installation = { ...inst, imei: tracker.imei, photo: inst.photo ? '[foto]' : '' };
  const patch: any = { id: assetId, installation, installPhoto: inst.photo, kmCalculated: inst.kmCalculated, odometerCheckDone: false };
  if (inst.initialKm != null) patch.kmOffset = Math.round(inst.initialKm - (v?.odometer || 0));
  if (inst.kmCalculated) patch.kmSource = 'rastreador';
  st.upsert('assets', patch);
  const km = inst.initialKm ?? Math.round(v?.odometer || 0);
  st.upsert('odometerReadings', { id: uid('od'), assetId, km, source: 'instalacao', by: inst.technician, photo: inst.photo, ts: inst.installedAt, calculated: inst.kmCalculated });
}
