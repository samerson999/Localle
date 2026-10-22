// Ciclo de vida do ativo: em operação → inativo (parado, mantém o rastreador) → vendido ou baixado (sai da frota).
// Vender, dar baixa ou retirar o rastreador encerra o vínculo em s.accessLog (deixa de consumir acesso na cobrança)
// e devolve o rastreador ao estoque. O histórico de vínculos (accessLog) fica como "Histórico de rastreadores".
import { useStore } from './store';
import { auditEntry } from './audit';
import { LIFECYCLE, lifeOf, isOut } from './assetStatus';
export { LIFECYCLE, lifeOf, isOut, opAssets, operatedIn, hadTracker } from './assetStatus';

// retira o rastreador: encerra o vínculo e devolve o equipamento ao estoque
export function unlinkTracker(assetId: string, reason: string) {
  useStore.getState().patch((s: any) => {
    const a = s.assets.find((x: any) => x.id === assetId);
    if (!a?.tracker) return {};
    const now = Date.now();
    return {
      assets: s.assets.map((x: any) => (x.id === assetId ? { ...x, tracker: null } : x)),
      accessLog: s.accessLog.map((l: any) => (l.assetId === assetId && !l.unlinkedAt ? { ...l, unlinkedAt: now, unlinkReason: reason } : l)),
      trackerStock: [...(s.trackerStock || []).filter((t: any) => t.imei !== a.tracker.imei), { imei: a.tracker.imei, model: a.tracker.model }],
      ...auditEntry(s, { coll: 'assets', refId: assetId, label: a.name, action: 'retirou o rastreador', note: `${a.tracker.imei} (${reason})` }),
    };
  });
}

export function setLifecycle(assetId: string, status: string, note: string, at = Date.now()) {
  const s = useStore.getState();
  const a = s.assets.find((x: any) => x.id === assetId);
  if (!a) return;
  if (LIFECYCLE[status].out && a.tracker) unlinkTracker(assetId, LIFECYCLE[status].label.toLowerCase());
  const prev = a.lifecycle || { status: 'ativo', history: [] };
  s.upsert('assets', { id: assetId, lifecycle: { status, at, note, history: [...(prev.history || []), { from: lifeOf(a), to: status, at, note, by: s.session?.name || '' }] } });
  s.patch((st: any) => auditEntry(st, { coll: 'assets', refId: assetId, label: a.name, action: `mudou a situação para ${LIFECYCLE[status].label.toLowerCase()}`, note }));
}

// Telas operacionais (listas, seletores, pendências) mostram só a frota atual: vendidos e baixados ("inativos") ficam
// de fora, a menos que a pessoa marque "Incluir inativos" (s.includeRetired, preferência de quem está vendo, vale em
// todos os módulos). Consultas por id (nome do veículo num registro antigo) continuam usando s.assets inteiro.
export const setIncludeRetired = (v: boolean) => useStore.getState().patch(() => ({ includeRetired: v }));

