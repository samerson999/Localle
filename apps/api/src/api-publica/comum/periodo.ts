import { BadRequestException } from '@nestjs/common';

const erro = (codigo: string, message: string) => new BadRequestException({ statusCode: 400, codigo, message });

function instante(v: unknown, campo: string): Date {
  const t = typeof v === 'string' && v.length <= 40 ? Date.parse(v) : Number.NaN;
  if (!Number.isFinite(t)) throw erro('data_invalida', `"${campo}" precisa ser uma data/hora ISO 8601 (ex.: 2026-11-23T00:00:00Z)`);
  return new Date(t);
}

/**
 * Período `de`/`ate` das séries temporais (docs/PLANO-API-PUBLICA.md § 4 e § 5): obrigatório e limitado a `maxDias`,
 * para nenhuma chamada varrer a tabela inteira.
 */
export function lerPeriodo(de: unknown, ate: unknown, maxDias: number): { de: Date; ate: Date } {
  if (de === undefined || ate === undefined || de === '' || ate === '') throw erro('periodo_obrigatorio', 'Informe "de" e "ate"');
  const d = instante(de, 'de');
  const a = instante(ate, 'ate');
  if (d > a) throw erro('periodo_invalido', '"de" não pode ser depois de "ate"');
  if (a.getTime() - d.getTime() > maxDias * 86_400_000) throw erro('periodo_longo', `Período máximo de ${maxDias} dias por chamada`);
  return { de: d, ate: a };
}

/** Janelas máximas por chamada (§ 5). */
export const JANELA = { posicoesDeUmVeiculo: 7, padrao: 31 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtro opcional por id na query (`veiculoId`, `motoristaId`…). */
export function uuidOpcional(v: unknown, campo: string): string | null {
  if (v === undefined || v === '') return null;
  if (typeof v !== 'string' || !UUID.test(v)) throw erro('parametro_invalido', `"${campo}" precisa ser um UUID`);
  return v;
}

/** Lista de cadastro curta: vai inteira numa página, no mesmo envelope das listas paginadas. */
export const paginaUnica = <T>(dados: T[]) => ({ dados, proximoCursor: null as string | null });

export const iso = (d: Date | string | null | undefined): string | null => (d ? new Date(d).toISOString() : null);
