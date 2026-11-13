import { trailerKm } from './couplings';

/**
 * Km (ou horas) que o rastreador informa, já com o ajuste do ativo; `null` = o aparelho não informa. O odômetro do painel
 * (rede CAN) é o número que o motorista vê e entra sem ajuste. Sem ele, só o odômetro/horímetro do próprio aparelho
 * (integração antiga). Decisão do usuário em 12/11/2026: km só do que o aparelho manda — nunca 0 nem km calculado no
 * lugar; antes a nossa API deixava o odômetro em 0 e a manutenção por km nunca andava.
 */
export function kmDoRastreador(a: any, v: any, ajuste = true): number | null {
  if (!v) return null;
  if (a?.meter === 'horimetro') return typeof v.hourmeter === 'number' ? v.hourmeter : null;
  if (typeof v.odoPainel === 'number') return v.odoPainel;
  return typeof v.odometer === 'number' ? v.odometer + (ajuste ? a?.kmOffset || 0 : 0) : null;
}

// km "oficial" do ativo conforme a origem escolhida (rastreador, lançamentos, mescla ou engate, para carretas). Rastreador que
// não informa km cai nos lançamentos (abastecimento, OS, leitura manual); sem nenhum dos dois, 0.
export function assetKm(s: any, assetId: string): number {
  const a = s.assets.find((x: any) => x.id === assetId);
  if (a?.kmSource === 'engate') return trailerKm(s, assetId, (id) => assetKm(s, id));
  const v = s.vehicles[assetId];
  // origem "rastreador" usa o valor do aparelho como veio; a mescla soma o ajuste do ativo (como antes)
  const tracker = kmDoRastreador(a, v, a?.kmSource !== 'rastreador');
  const manualVals = [
    ...s.fuelings.filter((f: any) => f.assetId === assetId).map((f: any) => [f.ts, f.odometer]),
    ...(s.odometerReadings || []).filter((r: any) => r.assetId === assetId && r.source !== 'rastreador').map((r: any) => [r.ts, r.km]),
    ...s.workOrders.filter((w: any) => w.assetId === assetId && w.odometerAt).map((w: any) => [w.releasedAt || w.openedAt, w.odometerAt]),
  ].sort((x: any, y: any) => x[0] - y[0]);
  const manual = manualVals.length ? manualVals[manualVals.length - 1][1] : 0;
  if (a?.kmSource === 'manual' || tracker === null) return manual;
  if (a?.kmSource === 'rastreador') return tracker;
  return Math.max(tracker, manual);
}

// Leitura do rastreador para a manutenção: uma leitura consolidada por veículo e por dia, com origem "rastreador".
// Cada consulta só atualiza a leitura do dia (fica o último valor); não cria uma linha por consulta.
// Devolve a lista nova, ou null se nada mudou.
export function consolidateTrackerReadings(s: any, now = Date.now()) {
  const d = new Date(now);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const list: any[] = s.odometerReadings || [];
  const byId = new Map(list.map((r: any) => [r.id, r]));
  const upd: Record<string, any> = {};
  for (const a of s.assets) {
    const v = s.vehicles[a.id];
    if (!a.tracker || !v || v.noSignal || a.meter === 'nenhum') continue;
    // rastreador que não informa km não gera leitura "do rastreador" (antes gravava o ajuste da instalação, parado)
    const lido = kmDoRastreador(a, v);
    if (lido === null) continue;
    const km = Math.round(lido * 10) / 10;
    const id = `rd-${a.id}-${day}`;
    const old = byId.get(id);
    if (!old || Math.abs(old.km - km) >= 1) upd[id] = { id, assetId: a.id, km, source: 'rastreador', by: 'Consulta ao rastreador', ts: now, day };
  }
  if (!Object.keys(upd).length) return null;
  return [...list.filter((r: any) => !upd[r.id]), ...Object.values(upd)];
}
