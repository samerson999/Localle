// Console da Locale · Clientes: cadastro, veículos, usuários, situação e saúde da conta.
// O contrato comercial (mensalidade/franquia/funcionalidades) vive em lib/contracts.ts, não aqui.
// Dados simulados; os nomes de inadimplentes e contratos vencendo seguem os mesmos da Visão geral (lib/platformOverview.ts).
// Os totais aqui ainda não alimentam a Visão geral (cada tela foi seedada à parte) — integrar é item futuro.
import { uid } from '@localle/shared/utils';

export type ClientStatus = 'implantacao' | 'ativo' | 'suspenso';
export interface PaymentRecord { id: string; date: number; amount: number; method: string; note: string }
export interface ClientRecord {
  id: string; name: string; vehicles: number; users: number;
  status: ClientStatus; since: number;
  payment: { status: 'em_dia' | 'atraso' | 'parcial'; daysLate: number; overdue: number; history: PaymentRecord[] };
  contractEndsAt: number | null;
}

export function seedClients(now = Date.now()): ClientRecord[] {
  const DAY = 86400000;
  return [
    { id: uid('cl'), name: 'Transportes Litoral', vehicles: 42, users: 6, status: 'ativo', since: now - 420 * DAY, payment: { status: 'atraso', daysLate: 14, overdue: 1860, history: [] }, contractEndsAt: now + 210 * DAY },
    { id: uid('cl'), name: 'Frigorífico Agreste', vehicles: 58, users: 8, status: 'ativo', since: now - 365 * DAY, payment: { status: 'parcial', daysLate: 6, overdue: 1520, history: [{ id: uid('pay'), date: now - 3 * DAY, amount: 1000, method: 'pix', note: 'Pagamento parcial da competência' }] }, contractEndsAt: now + 150 * DAY },
    { id: uid('cl'), name: 'Construtora Mar', vehicles: 21, users: 3, status: 'ativo', since: now - 300 * DAY, payment: { status: 'atraso', daysLate: 3, overdue: 832, history: [] }, contractEndsAt: now + 90 * DAY },
    { id: uid('cl'), name: 'Distribuidora Sertão', vehicles: 37, users: 5, status: 'ativo', since: now - 540 * DAY, payment: { status: 'em_dia', daysLate: 0, overdue: 0, history: [] }, contractEndsAt: now + 25 * DAY },
    { id: uid('cl'), name: 'Rastreia Nordeste', vehicles: 64, users: 9, status: 'ativo', since: now - 610 * DAY, payment: { status: 'em_dia', daysLate: 0, overdue: 0, history: [] }, contractEndsAt: now + 52 * DAY },
    { id: uid('cl'), name: 'Sat Track Caruaru', vehicles: 29, users: 4, status: 'ativo', since: now - 280 * DAY, payment: { status: 'em_dia', daysLate: 0, overdue: 0, history: [] }, contractEndsAt: now + 300 * DAY },
    { id: uid('cl'), name: 'Olinda Monitoramento', vehicles: 12, users: 2, status: 'implantacao', since: now - 10 * DAY, payment: { status: 'em_dia', daysLate: 0, overdue: 0, history: [] }, contractEndsAt: now + 360 * DAY },
    { id: uid('cl'), name: 'Logística Recôncavo', vehicles: 33, users: 5, status: 'ativo', since: now - 190 * DAY, payment: { status: 'em_dia', daysLate: 0, overdue: 0, history: [] }, contractEndsAt: now + 175 * DAY },
    { id: uid('cl'), name: 'Granja São Bento', vehicles: 9, users: 2, status: 'ativo', since: now - 95 * DAY, payment: { status: 'em_dia', daysLate: 0, overdue: 0, history: [] }, contractEndsAt: now + 270 * DAY },
    { id: uid('cl'), name: 'Expresso Caatinga', vehicles: 46, users: 6, status: 'suspenso', since: now - 500 * DAY, payment: { status: 'atraso', daysLate: 41, overdue: 3174, history: [] }, contractEndsAt: now + 15 * DAY },
  ];
}
