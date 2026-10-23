// Visão geral da Locale: clientes direto por plano, sem revenda no meio por ora (ver docs/PLANO-SETUP-ADMIN.md, seção 0).
// Dados simulados para a tela Console da Locale · Visão geral. O preço de cada plano vem do catálogo real (lib/plans.ts).
import { lastMonths } from './billing';

export const CHIP_COST = 9;
export const INFRA_COST = 650;
export const custoDoMes = (veiculos: number) => veiculos * CHIP_COST + INFRA_COST;

export interface OverdueClient { name: string; amount: number; daysLate: number }
export interface ExpiringContract { name: string; endsAt: number }
export interface PendingEquipment { label: string; value: number }
export interface MonthPoint { ym: string; vehicles: number; revenue: number }

export interface PlatformOverview {
  clientsActive: number; clientsActivePrev: number;
  vehiclesByPlan: Record<string, number>;
  history: MonthPoint[]; // 6 meses, o último é o mês atual
  overdueClients: OverdueClient[];
  expiringContracts: ExpiringContract[];
  trackersNoSignal: number;
  pendingEquipment: PendingEquipment[];
}

export function seedPlatformOverview(now = Date.now()): PlatformOverview {
  const months = lastMonths(6, now);
  const vehiclesRamp = [480, 505, 535, 560, 571, 612];
  const revenueRamp = [31000, 32600, 34200, 35800, 35320, 39588];
  return {
    clientsActive: 38, clientsActivePrev: 37,
    vehiclesByPlan: { 'pl-completo': 122, 'pl-gestao': 280, 'pl-essencial': 210 },
    history: months.map((ym, i) => ({ ym, vehicles: vehiclesRamp[i], revenue: revenueRamp[i] })),
    overdueClients: [
      { name: 'Transportes Litoral', amount: 1860, daysLate: 14 },
      { name: 'Frigorífico Agreste', amount: 1520, daysLate: 6 },
      { name: 'Construtora Mar', amount: 832, daysLate: 3 },
    ],
    expiringContracts: [
      { name: 'Distribuidora Sertão', endsAt: now + 25 * 86400000 },
      { name: 'Rastreia Nordeste', endsAt: now + 52 * 86400000 },
    ],
    trackersNoSignal: 14,
    pendingEquipment: [
      { label: 'Rastreador GT06 retirado', value: 450 },
      { label: 'Rastreador ST310U retirado', value: 380 },
      { label: 'Chicote de instalação', value: 120 },
      { label: 'Rastreador GT06 retirado', value: 450 },
      { label: 'Sensor de combustível', value: 350 },
    ],
  };
}
