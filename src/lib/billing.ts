// Cobrança da Locale às rastreadoras. Espelha fn_platform_billing no banco.
// Modelo A (por_rastreador): acessos × preço.
// Modelo B (pacote_minimo): paga o pacote mínimo (mín × preço) mesmo usando menos; o que passar do mínimo sai pelo preço do excedente.
// Base do acesso: "ativos" = rastreadores vinculados a veículo em algum momento do mês; "novos" = vinculações feitas no mês.
export interface BillingCfg { model: 'por_rastreador' | 'pacote_minimo'; price: number; min: number; extraPrice: number; basis: 'ativos' | 'novos' }
export const DEFAULT_BILLING: BillingCfg = { model: 'por_rastreador', price: 2, min: 100, extraPrice: 2, basis: 'ativos' };
export interface Link { imei: string; assetName: string; client: string; linkedAt: number; unlinkedAt?: number | null }

export const monthRange = (ym: string): [number, number] => { const [y, m] = ym.split('-').map(Number); return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime() - 1]; };
export const ymOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const lastMonths = (n: number, from = Date.now()) => Array.from({ length: n }, (_, i) => { const d = new Date(from); d.setDate(1); d.setMonth(d.getMonth() - (n - 1 - i)); return ymOf(d.getTime()); });

export function invoice(links: Link[], cfg: BillingCfg, ym: string) {
  const [a, b] = monthRange(ym);
  const active = links.filter((l) => l.linkedAt <= b && (!l.unlinkedAt || l.unlinkedAt >= a));
  const fresh = links.filter((l) => l.linkedAt >= a && l.linkedAt <= b);
  const billed = cfg.basis === 'novos' ? fresh : active;
  const n = billed.length;
  const lines: { label: string; qty: number; unit: number; total: number }[] = [];
  if (cfg.model === 'por_rastreador') lines.push({ label: `Acessos (${cfg.basis === 'novos' ? 'vinculações no mês' : 'rastreadores vinculados no mês'})`, qty: n, unit: cfg.price, total: n * cfg.price });
  else {
    lines.push({ label: `Pacote mínimo de ${cfg.min} acessos`, qty: cfg.min, unit: cfg.price, total: cfg.min * cfg.price });
    if (n > cfg.min) lines.push({ label: 'Acessos excedentes', qty: n - cfg.min, unit: cfg.extraPrice, total: (n - cfg.min) * cfg.extraPrice });
  }
  return { active: active.length, fresh: fresh.length, billed, accesses: n, lines, total: lines.reduce((s, l) => s + l.total, 0), unusedPackage: cfg.model === 'pacote_minimo' ? Math.max(0, cfg.min - n) : 0 };
}
export const otherModel = (cfg: BillingCfg): BillingCfg => ({ ...cfg, model: cfg.model === 'por_rastreador' ? 'pacote_minimo' : 'por_rastreador' });

// Cobrança da revenda da simulação com a Locale (acesso de suporte, Painel da revenda)
export function seedPlatform(now = Date.now()) {
  return { demoBilling: { ...DEFAULT_BILLING } };
}
