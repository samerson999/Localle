// Planos parametrizáveis da Locale (Console da Locale · Planos). Ver docs/PLANO-SETUP-ADMIN.md, seção 0.
// Versões: editar um plano grava uma versão nova; clientes já contratados continuam na versão em que entraram
// até serem migrados de propósito (nenhuma tela de Clientes lê isso ainda — é só o catálogo por enquanto).
import { uid } from '@localle/shared/utils';

export interface PlanModuleDef { key: string; name: string; icon: string }
export const MODULES: PlanModuleDef[] = [
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

export interface PlanAddon { key: string; price: number }
export interface PlanVersion {
  id: string; createdAt: number;
  pricePerVehicle: number;
  included: string[]; // chaves de MODULES
  addons: PlanAddon[]; // módulos avulsos (fora dos inclusos), com preço próprio
  minVehicles: number; maxVehicles: number | null;
  maxUsers: number | null;
  historyMonths: number;
  comboDiscountPct: number; // desconto ao contratar 2 ou mais avulsos
}
export interface Plan {
  id: string; name: string; status: 'ativo' | 'arquivado';
  versions: PlanVersion[]; // a última é a vigente
}
export const currentVersion = (p: Plan): PlanVersion => p.versions[p.versions.length - 1];

const mkV = (v: Omit<PlanVersion, 'id' | 'createdAt'>, createdAt: number): PlanVersion => ({ id: uid('pv'), createdAt, ...v });
export const newVersionFrom = (cur: PlanVersion, patch: Partial<PlanVersion>): PlanVersion => mkV({ ...cur, ...patch }, Date.now());

