// Contrato individual por cliente (Console da Locale · Contratos) e apuração mensal (Faturamento).
// Vive aqui porque front (estimativa na tela) e API (apuração e fechamento da competência) precisam da mesma
// regra — docs/ARQUITETURA-BACKEND.md § 0. Cobrança é mensalidade fixa OU por veículo ativo (franquia +
// excedente). Editar valores comerciais grava uma versão nova; situação e vigência não são versionadas.

export interface ModuleDef { key: string; name: string; icon: string }
export const MODULES: ModuleDef[] = [
  { key: 'monitoramento', name: 'Monitoramento', icon: 'monitoramento' },
  { key: 'ativos', name: 'Ativos', icon: 'ativos' },
  { key: 'manutencao', name: 'Manutenção', icon: 'manutencao' },
  { key: 'combustivel', name: 'Combustível', icon: 'combustivel' },
  { key: 'checklist', name: 'Checklist', icon: 'checklist' },
  { key: 'viagens', name: 'Viagens', icon: 'viagens' },
  { key: 'multas', name: 'Multas', icon: 'multas' },
  { key: 'jornada', name: 'Jornada', icon: 'jornada' },
  { key: 'ranking', name: 'Ranking', icon: 'ranking' },
  { key: 'pneus', name: 'Pneus', icon: 'pneus' },
];
export const MODULE_KEYS = MODULES.map((m) => m.key);
export const moduleName = (key: string) => MODULES.find((m) => m.key === key)?.name || key;

export type BillingType = 'mensalidade_fixa' | 'por_veiculo_ativo';
export const BILLING_TYPES: BillingType[] = ['mensalidade_fixa', 'por_veiculo_ativo'];
export type ContractStatus = 'implantacao' | 'ativo' | 'suspenso' | 'cancelado';
export const CONTRACT_STATUSES: ContractStatus[] = ['implantacao', 'ativo', 'suspenso', 'cancelado'];
/** Situações em que os usuários do cliente perdem o acesso (login e tokens já emitidos). */
export const BLOCKED_STATUSES: ContractStatus[] = ['suspenso', 'cancelado'];

/** Condições comerciais de uma versão do contrato (o que é versionado). */
export interface ContractTerms {
  billingType: BillingType;
  fixedPrice: number; // mensalidade_fixa
  included: number; // franquia: veículos inclusos na mensalidade-base (0 = sem franquia, cobra tudo por veículo)
  basePrice: number; // mensalidade-base cobrindo a franquia
  pricePerVehicle: number; // por veículo ativo, quando não há franquia
  extraPrice: number; // veículo excedente acima da franquia
  modules: string[]; // chaves de MODULES
  maxUsers: number | null;
  historyMonths: number;
  dueDay: number; // dia de vencimento (1–28)
  toleranceDays: number; // tolerância antes de marcar atraso crítico
}
export interface ContractVersion extends ContractTerms { id: string; createdAt: number }

export const COMMERCIAL_FIELDS: (keyof ContractTerms)[] = ['billingType', 'fixedPrice', 'included', 'basePrice', 'pricePerVehicle', 'extraPrice', 'modules', 'maxUsers', 'historyMonths', 'dueDay', 'toleranceDays'];
export const changedCommercial = (a: ContractTerms, b: ContractTerms) => COMMERCIAL_FIELDS.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

// Medição diária de veículos ativos (veículo-dia): um veículo conta no dia se teve instalação vigente nele.
export interface DailyMeasurement { date: string; activeVehicles: number } // date = 'YYYY-MM-DD'

export const daysInMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** Média de veículos-dia no mês — soma dos dias medidos sobre os dias do mês inteiro (proporcional). */
export function avgActiveVehicles(measurements: DailyMeasurement[], ym: string): number {
  const sum = measurements.filter((m) => m.date.startsWith(ym)).reduce((a, m) => a + m.activeVehicles, 0);
  return sum / daysInMonth(ym);
}

export interface ApuracaoResult {
  billingType: BillingType;
  avgVehicles: number; // 0 quando mensalidade_fixa
  base: number; // mensalidade-base ou mensalidade fixa
  extra: number; // excedente sobre a franquia (ou tudo, sem franquia)
  total: number;
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** Apuração do mês para uma versão de contrato, a partir da medição diária. Valores em centavos arredondados. */
export function apurar(v: ContractTerms, measurements: DailyMeasurement[], ym: string): ApuracaoResult {
  if (v.billingType === 'mensalidade_fixa') return { billingType: v.billingType, avgVehicles: 0, base: cents(v.fixedPrice), extra: 0, total: cents(v.fixedPrice) };
  const avg = avgActiveVehicles(measurements, ym);
  const base = v.included > 0 ? v.basePrice : 0;
  const extra = v.included > 0 ? Math.max(0, avg - v.included) * v.extraPrice : avg * v.pricePerVehicle;
  return { billingType: v.billingType, avgVehicles: avg, base: cents(base), extra: cents(extra), total: cents(base) + cents(extra) };
}

/** Estimativa com a frota de agora, sem proporcionalidade (receita prevista). */
export function estimar(v: ContractTerms, vehiclesNow: number): number {
  if (v.billingType === 'mensalidade_fixa') return cents(v.fixedPrice);
  if (v.included > 0) return cents(v.basePrice + Math.max(0, vehiclesNow - v.included) * v.extraPrice);
  return cents(vehiclesNow * v.pricePerVehicle);
}

/** Vencimento da fatura de uma competência: `dueDay` do mês seguinte. 'YYYY-MM' → 'YYYY-MM-DD'. */
export function dueDateOf(ym: string, dueDay: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, dueDay)); // mês seguinte (m é 1-based, Date.UTC 0-based)
  return d.toISOString().slice(0, 10);
}

/** Dias de atraso em relação ao vencimento (0 se ainda não venceu). `today` = 'YYYY-MM-DD'. */
export function daysLate(dueDate: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(dueDate)) / 86400000));
}

/** Valida termos vindos de fora (corpo HTTP, formulário). Devolve a lista de problemas; vazia = válido. */
export function validateTerms(t: Partial<ContractTerms>): string[] {
  const errs: string[] = [];
  const money = (k: keyof ContractTerms) => { const v = t[k]; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10_000_000) errs.push(`"${k}" precisa ser um valor de 0 a 10.000.000`); };
  const int = (k: keyof ContractTerms, min: number, max: number) => { const v = t[k]; if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) errs.push(`"${k}" precisa ser inteiro de ${min} a ${max}`); };
  if (!BILLING_TYPES.includes(t.billingType as BillingType)) errs.push('"billingType" inválido');
  money('fixedPrice'); money('basePrice'); money('pricePerVehicle'); money('extraPrice');
  int('included', 0, 100_000); int('historyMonths', 1, 120); int('dueDay', 1, 28); int('toleranceDays', 0, 90);
  if (t.maxUsers !== null && (typeof t.maxUsers !== 'number' || !Number.isInteger(t.maxUsers) || t.maxUsers < 1 || t.maxUsers > 100_000)) errs.push('"maxUsers" precisa ser inteiro de 1 a 100.000 ou nulo');
  if (!Array.isArray(t.modules) || t.modules.some((m) => !MODULE_KEYS.includes(m)) || new Set(t.modules).size !== t.modules.length) errs.push('"modules" tem módulo inválido ou repetido');
  return errs;
}
