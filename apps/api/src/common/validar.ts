import { BadRequestException } from '@nestjs/common';
import { parseDate } from './parse-date';
import { parseUuid } from './parse-uuid';

/**
 * Validação explícita de corpo (sem class-validator no projeto), compartilhada pelos cadastros novos.
 * Cada função lança 400 com o nome do campo; `opcional` devolve `null` para ausente/vazio.
 */
export function erro(msg: string): never {
  throw new BadRequestException(msg);
}

export function texto(v: unknown, campo: string, max: number, min = 1): string {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max) erro(`"${campo}" precisa ter de ${min} a ${max} caracteres`);
  return v.trim();
}

export function textoOpcional(v: unknown, campo: string, max: number): string | null {
  if (v === undefined || v === null || v === '') return null;
  return texto(v, campo, max);
}

export function numero(v: unknown, campo: string, min: number, max: number, inteiro = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (inteiro && !Number.isInteger(v))) {
    erro(`"${campo}" precisa ser ${inteiro ? 'inteiro' : 'número'} entre ${min} e ${max}`);
  }
  return v;
}

export function numeroOpcional(v: unknown, campo: string, min: number, max: number, inteiro = false): number | null {
  if (v === undefined || v === null || v === '') return null;
  return numero(v, campo, min, max, inteiro);
}

export function booleano(v: unknown, campo: string, padrao = false): boolean {
  if (v === undefined || v === null) return padrao;
  if (typeof v !== 'boolean') erro(`"${campo}" precisa ser true ou false`);
  return v;
}

export function opcao<T extends string>(v: unknown, campo: string, opcoes: readonly T[], padrao?: T): T {
  if ((v === undefined || v === null || v === '') && padrao !== undefined) return padrao;
  if (!opcoes.includes(v as T)) erro(`"${campo}" precisa ser um de: ${opcoes.join(', ')}`);
  return v as T;
}

/** Data (`YYYY-MM-DD`) opcional — guardada como `date` no Postgres. */
export function dataOpcional(v: unknown, campo: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) erro(`"${campo}" precisa ser uma data YYYY-MM-DD`);
  return v;
}

/** Instante (ISO 8601) obrigatório — `timestamptz`. */
export function instante(v: unknown, campo: string): Date {
  const t = typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(t) || t < Date.UTC(2000, 0, 1) || t > Date.now() + 10 * 366 * 86_400_000) erro(`"${campo}" precisa ser uma data/hora válida`);
  return new Date(t);
}

export function instanteOpcional(v: unknown, campo: string): Date | null {
  if (v === undefined || v === null || v === '') return null;
  return instante(v, campo);
}

export function uuid(v: unknown, campo: string): string {
  return parseUuid(campo, v);
}

export function uuidOpcional(v: unknown, campo: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  return parseUuid(campo, v);
}

export function listaUuids(v: unknown, campo: string, max = 500): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) erro(`"${campo}" precisa ser uma lista de até ${max} ids`);
  return [...new Set(v.map((x, i) => parseUuid(`${campo}[${i}]`, x)))];
}

/** Objeto livre (chave → texto/número), para campos extras do cadastro; limitado para não virar depósito. */
export function dicionario(v: unknown, campo: string, maxChaves = 50): Record<string, string | number> {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) erro(`"${campo}" precisa ser um objeto`);
  const entradas = Object.entries(v as Record<string, unknown>);
  if (entradas.length > maxChaves) erro(`"${campo}" aceita até ${maxChaves} chaves`);
  const out: Record<string, string | number> = {};
  for (const [k, val] of entradas) {
    if (k.length > 60 || (typeof val !== 'string' && typeof val !== 'number') || (typeof val === 'string' && val.length > 300)) {
      erro(`"${campo}.${k}" precisa ser texto (até 300) ou número`);
    }
    out[k] = val;
  }
  return out;
}

const DIA = 86_400_000;

/** Para `periodo`: listagem sem teto de período (combustível e ranking — sprint de monitoramento, 28/10/2026). */
export const SEM_LIMITE = Infinity;

/** Período de consulta `?de=&ate=` (ISO): padrão últimos `padraoDias`; no máximo `maxDias`. */
export function periodo(de: unknown, ate: unknown, padraoDias = 30, maxDias = 93): [Date, Date] {
  const fim = ate ? parseDate('ate', ate) : new Date();
  const inicio = de ? parseDate('de', de) : new Date(fim.getTime() - padraoDias * DIA);
  if (inicio > fim) erro('"de" precisa ser anterior a "ate"');
  if (fim.getTime() - inicio.getTime() > maxDias * DIA) erro(`Período máximo: ${maxDias} dias`);
  return [inicio, fim];
}
