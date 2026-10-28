// Combustível: postos, conferência nota × lançamento, índice de confiabilidade do motorista, metas e leitura do XML da NF-e.
// NO PRODUTO REAL a conferência roda no backend; a busca da nota pela chave virá da SEFAZ ou de um fornecedor (custo em avaliação).
import { DAY, groupBy, sum } from './utils';

// Parâmetros do Setup (docs/PLANO-SETUP-ADMIN.md 3.2): salto de km e tolerâncias da conferência.
// tolKm: correção do km lido do rastreador acima disso entra no índice de confiabilidade.
export const FUEL_PARAMS = { kmJumpMax: 10000, tolLitersPct: 2, tolValue: 1.0, tolDays: 1, requireSameStation: true, tolKm: 50 };

// Postos da simulação, com localização para o mapa de preço por região (UF › cidade › bairro).
export const STATIONS = [
  { id: 'p1', name: 'Posto BR-101 Prazeres', cnpj: '11.222.333/0001-01', uf: 'PE', city: 'Jaboatão dos Guararapes', bairro: 'Prazeres', lat: -8.1662, lng: -34.9223, bias: 0.99 },
  { id: 'p2', name: 'Posto Ipiranga Boa Viagem', cnpj: '22.333.444/0001-02', uf: 'PE', city: 'Recife', bairro: 'Boa Viagem', lat: -8.1188, lng: -34.9012, bias: 1.03 },
  { id: 'p3', name: 'Posto Shell Imbiribeira', cnpj: '33.444.555/0001-03', uf: 'PE', city: 'Recife', bairro: 'Imbiribeira', lat: -8.1067, lng: -34.9149, bias: 1.0 },
  { id: 'p4', name: 'Posto Petrobras Olinda', cnpj: '44.555.666/0001-04', uf: 'PE', city: 'Olinda', bairro: 'Peixinhos', lat: -8.0111, lng: -34.8768, bias: 0.98 },
  { id: 'p5', name: 'Posto Ale Casa Amarela', cnpj: '55.666.777/0001-05', uf: 'PE', city: 'Recife', bairro: 'Casa Amarela', lat: -8.0283, lng: -34.9179, bias: 1.06 },
  { id: 'p6', name: 'Posto Suape Cabo', cnpj: '66.777.888/0001-06', uf: 'PE', city: 'Cabo de Santo Agostinho', bairro: 'Suape', lat: -8.3735, lng: -34.9547, bias: 0.96 },
  { id: 'p7', name: 'Posto Caruaru BR-232', cnpj: '77.888.999/0001-07', uf: 'PE', city: 'Caruaru', bairro: 'Indianópolis', lat: -8.2760, lng: -35.9819, bias: 0.97 },
  { id: 'p8', name: 'Posto João Pessoa BR-230', cnpj: '88.999.000/0001-08', uf: 'PB', city: 'João Pessoa', bairro: 'Cristo Redentor', lat: -7.1564, lng: -34.8840, bias: 1.01 },
];
export const stationOf = (f: any) => STATIONS.find((p) => p.id === f.stationId) || STATIONS.find((p) => p.name === f.station);

// ---------- conferência nota × lançamento ----------
export type DivKind = 'litros' | 'valor' | 'data' | 'posto' | 'km';
export const DIV_LABEL: Record<DivKind, string> = { litros: 'Litros', valor: 'Valor', data: 'Data', posto: 'Posto', km: 'Km diferente do rastreador' };
export function nfCheck(f: any, p = FUEL_PARAMS): { kind: DivKind; detail: string }[] {
  const n = f.nf; if (!n) return [];
  const out: { kind: DivKind; detail: string }[] = [];
  if (n.liters != null && Math.abs(n.liters - f.liters) > (f.liters * p.tolLitersPct) / 100) out.push({ kind: 'litros', detail: `nota ${n.liters.toFixed(2)} L × lançado ${f.liters.toFixed(2)} L` });
  if (n.total != null && Math.abs(n.total - f.total) > p.tolValue) out.push({ kind: 'valor', detail: `nota R$ ${n.total.toFixed(2)} × lançado R$ ${f.total.toFixed(2)}` });
  if (n.date && Math.abs(new Date(n.date).getTime() - f.ts) > p.tolDays * DAY) out.push({ kind: 'data', detail: `nota ${new Date(n.date).toLocaleDateString('pt-BR')} × lançado ${new Date(f.ts).toLocaleDateString('pt-BR')}` });
  const st = stationOf(f);
  if (p.requireSameStation && n.cnpj && st && n.cnpj.replace(/\D/g, '') !== st.cnpj.replace(/\D/g, '')) out.push({ kind: 'posto', detail: `CNPJ da nota ${n.cnpj} × posto lançado ${st.name}` });
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

