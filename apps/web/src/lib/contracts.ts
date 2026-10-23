// Console da Locale · Contratos: contrato individual por cliente, sem catálogo de planos fixo.
// Ver planejamento/plano-contratos-faturamento-rastreadores (Localle DNA). Dados simulados.
// Cobrança pode ser mensalidade fixa OU por veículo ativo (franquia + excedente); cada cliente escolhe uma.
// Editar valores comerciais grava uma versão nova (contractVersions); nome do cliente e situação não são versionados.
import { uid } from '@localle/shared/utils';

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
export const moduleName = (key: string) => MODULES.find((m) => m.key === key)?.name || key;

export type BillingType = 'mensalidade_fixa' | 'por_veiculo_ativo';
export type ContractStatus = 'implantacao' | 'ativo' | 'suspenso' | 'cancelado';

export interface ContractVersion {
  id: string; createdAt: number;
  billingType: BillingType;
  // mensalidade_fixa
  fixedPrice: number;
  // por_veiculo_ativo
  included: number; // franquia: veículos inclusos na mensalidade-base (0 = sem franquia, cobra tudo por veículo)
  basePrice: number; // mensalidade-base cobrindo a franquia
  pricePerVehicle: number; // valor por veículo ativo acima da franquia (ou de todos, se included = 0)
  extraPrice: number; // valor do veículo excedente, quando diferente de pricePerVehicle (franquia com teto)
  // comum
  modules: string[]; // chaves de MODULES habilitadas no contrato
  maxUsers: number | null;
  historyMonths: number;
  dueDay: number; // dia de vencimento
  toleranceDays: number; // tolerância antes de marcar atraso crítico
}
export interface Contract {
  id: string; clientId: string; status: ContractStatus;
  startAt: number; endAt: number | null;
  versions: ContractVersion[]; // a última é a vigente
}
export const currentVersion = (c: Contract): ContractVersion => c.versions[c.versions.length - 1];

const mkV = (v: Omit<ContractVersion, 'id' | 'createdAt'>, createdAt: number): ContractVersion => ({ id: uid('cv'), createdAt, ...v });
export const newVersionFrom = (cur: ContractVersion, patch: Partial<ContractVersion>): ContractVersion => mkV({ ...cur, ...patch }, Date.now());
export const duplicateFrom = (c: Contract): ContractVersion => mkV({ ...currentVersion(c) }, Date.now());

export const COMMERCIAL_FIELDS: (keyof ContractVersion)[] = ['billingType', 'fixedPrice', 'included', 'basePrice', 'pricePerVehicle', 'extraPrice', 'modules', 'maxUsers', 'historyMonths', 'dueDay', 'toleranceDays'];
export const changedCommercial = (a: ContractVersion, b: ContractVersion) => COMMERCIAL_FIELDS.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

// Medição diária de veículos ativos (veículo-dia), para apuração proporcional do mês.
// Um veículo conta como ativo no dia se teve instalação válida de rastreador naquele dia.
export interface DailyMeasurement { date: string; activeVehicles: number } // date = 'YYYY-MM-DD'

export function seedDailyMeasurements(clientId: string, vehiclesNow: number, now = Date.now()): DailyMeasurement[] {
  const DAY = 86400000;
  const out: DailyMeasurement[] = [];
  // simula oscilação: metade do mês com menos 1-3 veículos (instalação/retirada no período), estabiliza no fim
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    const date = d.toISOString().slice(0, 10);
    const ramp = i > 14 ? Math.max(0, vehiclesNow - 2 - Math.floor(i / 10)) : vehiclesNow;
    out.push({ date, activeVehicles: ramp });
  }
  // determinístico por clientId (mesmo cliente sempre gera a mesma série)
  void clientId;
  return out;
}

export const daysInMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

/** Média de veículos-dia no mês (proporcional a instalações/retiradas durante o período). */
export function avgActiveVehicles(measurements: DailyMeasurement[], ym: string): number {
  const inMonth = measurements.filter((m) => m.date.startsWith(ym));
  if (!inMonth.length) return 0;
  const sum = inMonth.reduce((a, m) => a + m.activeVehicles, 0);
  return sum / daysInMonth(ym);
}

export interface ApuracaoResult {
  billingType: BillingType;
  avgVehicles: number; // 0 quando mensalidade_fixa
  base: number; // mensalidade-base ou mensalidade fixa
  extra: number; // valor do excedente sobre a franquia
  total: number;
}

/** Apuração do mês para um contrato, a partir da medição diária (veículos-dia). Resultado preservado por competência. */
export function apurar(v: ContractVersion, measurements: DailyMeasurement[], ym: string): ApuracaoResult {
  if (v.billingType === 'mensalidade_fixa') return { billingType: v.billingType, avgVehicles: 0, base: v.fixedPrice, extra: 0, total: v.fixedPrice };
  const avg = avgActiveVehicles(measurements, ym);
  const extraQty = Math.max(0, avg - v.included);
  const base = v.included > 0 ? v.basePrice : 0;
  const extra = v.included > 0 ? extraQty * v.extraPrice : avg * v.pricePerVehicle;
  return { billingType: v.billingType, avgVehicles: avg, base, extra, total: base + extra };
}

export function seedContracts(clientIds: { id: string; vehicles: number }[], now = Date.now()): Contract[] {
  const DAY = 86400000;
  const templates: Omit<ContractVersion, 'id' | 'createdAt'>[] = [
    { billingType: 'por_veiculo_ativo', fixedPrice: 0, included: 0, basePrice: 0, pricePerVehicle: 99, extraPrice: 99, modules: ['monitoramento', 'ativos', 'manutencao', 'combustivel', 'checklist', 'viagens', 'multas', 'jornada', 'ranking', 'pneus'], maxUsers: null, historyMonths: 12, dueDay: 10, toleranceDays: 5 },
    { billingType: 'por_veiculo_ativo', fixedPrice: 0, included: 0, basePrice: 0, pricePerVehicle: 69, extraPrice: 69, modules: ['monitoramento', 'ativos', 'manutencao', 'combustivel', 'checklist', 'viagens'], maxUsers: 10, historyMonths: 6, dueDay: 5, toleranceDays: 3 },
    { billingType: 'por_veiculo_ativo', fixedPrice: 0, included: 0, basePrice: 0, pricePerVehicle: 39, extraPrice: 39, modules: ['monitoramento', 'ativos'], maxUsers: 3, historyMonths: 3, dueDay: 15, toleranceDays: 5 },
    { billingType: 'mensalidade_fixa', fixedPrice: 2400, included: 0, basePrice: 0, pricePerVehicle: 0, extraPrice: 0, modules: ['monitoramento', 'ativos', 'manutencao'], maxUsers: 5, historyMonths: 6, dueDay: 10, toleranceDays: 5 },
  ];
  return clientIds.map((c, i) => {
    const t = templates[i % templates.length];
    return { id: uid('ct'), clientId: c.id, status: 'ativo' as ContractStatus, startAt: now - (200 + i * 10) * DAY, endAt: null, versions: [mkV(t, now - (200 + i * 10) * DAY)] };
  });
}
