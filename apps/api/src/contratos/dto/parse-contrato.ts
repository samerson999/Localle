import { BadRequestException } from '@nestjs/common';
import { CONTRACT_STATUSES, validateTerms, type ContractStatus, type ContractTerms } from '@localle/shared/contratos';

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseData(label: string, v: unknown): string {
  // round-trip: Date.parse('2026-02-31') não é NaN (o V8 rola para 03/03), mas o Postgres recusa → 500
  const ok = typeof v === 'string' && DATA.test(v) && !Number.isNaN(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  if (!ok) throw new BadRequestException(`"${label}" precisa ser uma data AAAA-MM-DD válida`);
  return v as string;
}

export function parseCompetencia(v: unknown): string {
  if (typeof v !== 'string' || !COMPETENCIA.test(v)) throw new BadRequestException('"competencia" precisa ser AAAA-MM');
  return v;
}

export interface ContratoInput {
  status: ContractStatus;
  inicioEm: string;
  fimEm: string | null;
  terms: ContractTerms;
}

/** Corpo de criação/edição: `{ status, inicioEm, fimEm, terms }`. Os termos são validados pela regra compartilhada. */
export function parseContrato(body: unknown): ContratoInput {
  const o = (body ?? {}) as Record<string, unknown>;
  if (!CONTRACT_STATUSES.includes(o.status as ContractStatus)) throw new BadRequestException('"status" inválido');
  const inicioEm = parseData('inicioEm', o.inicioEm);
  const fimEm = o.fimEm === null || o.fimEm === undefined || o.fimEm === '' ? null : parseData('fimEm', o.fimEm);
  if (fimEm && fimEm < inicioEm) throw new BadRequestException('"fimEm" não pode ser antes de "inicioEm"');
  const t = (o.terms ?? {}) as Record<string, unknown>;
  const terms = {
    billingType: t.billingType,
    fixedPrice: t.fixedPrice,
    included: t.included,
    basePrice: t.basePrice,
    pricePerVehicle: t.pricePerVehicle,
    extraPrice: t.extraPrice,
    modules: t.modules,
    maxUsers: t.maxUsers ?? null,
    historyMonths: t.historyMonths,
    dueDay: t.dueDay,
    toleranceDays: t.toleranceDays,
  } as ContractTerms;
  const errs = validateTerms(terms);
  if (errs.length) throw new BadRequestException(errs);
  return { status: o.status as ContractStatus, inicioEm, fimEm, terms };
}
