// Combustível: conferência nota × lançamento, índice de confiabilidade do motorista, metas e leitura do XML da NF-e.
// NO PRODUTO REAL a conferência roda no backend; a busca da nota pela chave virá da SEFAZ ou de um fornecedor (custo em avaliação).
import { DAY, groupBy, sum } from './utils';

// Parâmetros do Setup (docs/PLANO-SETUP-ADMIN.md 3.2): salto de km e tolerâncias da conferência.
// tolKm: correção do km lido do rastreador acima disso entra no índice de confiabilidade.
export const FUEL_PARAMS = { kmJumpMax: 10000, tolLitersPct: 2, tolValue: 1.0, tolDays: 1, requireSameStation: true, tolKm: 50 };

// ---------- conferência nota × lançamento ----------
export type DivKind = 'litros' | 'valor' | 'data' | 'posto' | 'km';
export const DIV_LABEL: Record<DivKind, string> = { litros: 'Litros', valor: 'Valor', data: 'Data', posto: 'Posto', km: 'Km diferente do rastreador' };
export function nfCheck(f: any, p = FUEL_PARAMS): { kind: DivKind; detail: string }[] {
  const n = f.nf; if (!n) return [];
  const out: { kind: DivKind; detail: string }[] = [];
  if (n.liters != null && Math.abs(n.liters - f.liters) > (f.liters * p.tolLitersPct) / 100) out.push({ kind: 'litros', detail: `nota ${n.liters.toFixed(2)} L × lançado ${f.liters.toFixed(2)} L` });
  if (n.total != null && Math.abs(n.total - f.total) > p.tolValue) out.push({ kind: 'valor', detail: `nota R$ ${n.total.toFixed(2)} × lançado R$ ${f.total.toFixed(2)}` });
  if (n.date && Math.abs(new Date(n.date).getTime() - f.ts) > p.tolDays * DAY) out.push({ kind: 'data', detail: `nota ${new Date(n.date).toLocaleDateString('pt-BR')} × lançado ${new Date(f.ts).toLocaleDateString('pt-BR')}` });
  // posto digitado pelo cliente no lançamento (nome e CNPJ); sem CNPJ lançado não há o que comparar
  if (p.requireSameStation && n.cnpj && f.stationCnpj && n.cnpj.replace(/\D/g, '') !== f.stationCnpj.replace(/\D/g, '')) out.push({ kind: 'posto', detail: `CNPJ da nota ${n.cnpj} × posto lançado ${f.station || f.stationCnpj}` });
  return out;
}
export const nfStatus = (f: any) => (!f.nf ? 'sem_nota' : nfCheck(f).length ? 'divergente' : 'conferida');
// km corrigido no lançamento: o rastreador marcou kmTracker e o motorista lançou outro valor
export const kmDiff = (f: any) => (f.kmTracker == null ? null : f.odometer - f.kmTracker);
export function kmCheck(f: any, p = FUEL_PARAMS): { kind: DivKind; detail: string }[] {
  const d = kmDiff(f);
  return d != null && Math.abs(d) > p.tolKm ? [{ kind: 'km', detail: `lançado ${f.odometer.toLocaleString('pt-BR')} km × rastreador ${f.kmTracker.toLocaleString('pt-BR')} km (${d > 0 ? '+' : ''}${d.toLocaleString('pt-BR')} km)` }] : [];
}
export const divergences = (f: any) => [...nfCheck(f), ...kmCheck(f)];

// Índice de confiabilidade: % dos lançamentos conferidos (com nota ou com km do rastreador) sem divergência.
// Mínimo de 3 conferidos por motorista para ter índice.
export function reliability(s: any, from: number, to: number) {
  const rows = s.fuelings.filter((f: any) => f.ts >= from && f.ts <= to && f.driverId);
  return Object.entries(groupBy(rows, (f: any) => f.driverId)).map(([driverId, arr]: any) => {
    const withNf = arr.filter((f: any) => f.nf || f.kmTracker != null);
    const divs = withNf.map((f: any) => ({ f, d: divergences(f) })).filter((x: any) => x.d.length);
    const byKind: Record<string, number> = {};
    divs.forEach((x: any) => x.d.forEach((d: any) => (byKind[d.kind] = (byKind[d.kind] || 0) + 1)));
    return { driverId, name: s.drivers.find((d: any) => d.id === driverId)?.name || driverId, fuelings: arr.length, withNf: withNf.length, divergent: divs.length, byKind, index: withNf.length >= 3 ? 1 - divs.length / withNf.length : null, last: divs.sort((a: any, b: any) => b.f.ts - a.f.ts)[0] };
  }).sort((a, b) => (a.index ?? 2) - (b.index ?? 2));
}

// ---------- chave de acesso e XML da NF-e ----------
export function validKey(k: string) {
  const d = k.replace(/\D/g, ''); if (d.length !== 44) return false;
  let w = 2, s = 0; for (let i = 42; i >= 0; i--) { s += +d[i] * w; w = w === 9 ? 2 : w + 1; }
  const dv = s % 11 < 2 ? 0 : 11 - (s % 11);
  return dv === +d[43];
}
// lê os campos da NF-e (modelo 55/65) que a conferência usa
export function parseNfeXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const tag = (n: string, root: Document | Element = doc) => root.getElementsByTagName(n)[0]?.textContent?.trim() || '';
  const inf = doc.getElementsByTagName('infNFe')[0];
  if (!inf) throw new Error('O arquivo não parece ser o XML de uma NF-e.');
  const emit = doc.getElementsByTagName('emit')[0];
  const items = [...doc.getElementsByTagName('det')].map((d) => ({ desc: tag('xProd', d), unit: tag('uCom', d), qty: +tag('qCom', d) || 0, value: +tag('vProd', d) || 0 }));
  const fuel = items.find((i) => /^L/i.test(i.unit) || /diesel|gasolina|etanol|gnv/i.test(i.desc)) || items[0];
  return {
    chave: (inf.getAttribute('Id') || '').replace(/^NFe/, '') || tag('chNFe'), cnpj: emit ? tag('CNPJ', emit).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '',
    station: emit ? tag('xNome', emit) : '', date: tag('dhEmi') || tag('dEmi'), liters: fuel ? fuel.qty : null, total: +tag('vNF') || null, product: fuel?.desc || '',
    city: emit ? tag('xMun', emit) : '', uf: emit ? tag('UF', emit) : '', bairro: emit ? tag('xBairro', emit) : '',
  };
}

// ---------- metas ----------
// meta efetiva de km/L do veículo: veículo > tipo de operação > grupo > empresa
export function goalFor(s: any, a: any) {
  const g = s.fuelGoals || {};
  if (a?.fuelGoal) return { kml: a.fuelGoal, from: 'veículo' };
  if (a?.operationId && g.operations?.[a.operationId]) return { kml: g.operations[a.operationId], from: 'operação' };
  const grp = (a?.groupIds || []).map((id: string) => g.groups?.[id]).find(Boolean);
  if (grp) return { kml: grp, from: 'grupo' };
  return g.company?.kml ? { kml: g.company.kml, from: 'empresa' } : null;
}
// gasto do mês corrente (para o teto indicativo)
export function monthSpend(s: any, filter: (f: any) => boolean, now = Date.now()) {
  const d = new Date(now); const m0 = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return sum(s.fuelings.filter((f: any) => f.ts >= m0 && f.ts <= now && filter(f)).map((f: any) => f.total));
}

// consumo pelo método tanque cheio (km desde o abastecimento anterior ÷ litros)
export function withKml(fuelings: any[]) {
  const by = groupBy(fuelings, (f: any) => f.assetId);
  const out: any[] = [];
  for (const arr of Object.values(by)) { const s = [...arr].sort((a: any, b: any) => a.odometer - b.odometer); s.forEach((f: any, i: number) => out.push({ ...f, km: i ? f.odometer - s[i - 1].odometer : 0 })); }
  return out;
}

