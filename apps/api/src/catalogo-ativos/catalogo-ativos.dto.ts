import { erro, texto } from '../common/validar';
import { parseUuid } from '../common/parse-uuid';

const BASES = ['veiculo', 'implemento', 'linha_amarela', 'equipamento'] as const;
const PADRAO = /^[a-z_]{1,40}$/;
const ICONE = /^[0-9]{2}-[a-z0-9-]{1,60}$/;

/** Nome que só tem pontuação/espaço teria chave vazia: o banco recusaria com erro genérico. */
function nome(v: unknown, max: number): string {
  const n = texto(v, 'nome', max);
  if (!/[\p{L}\p{N}]/u.test(n)) erro('"nome" precisa ter letra ou número');
  return n;
}

export const parseNomeMarca = (b: { nome?: unknown } | undefined) => nome(b?.nome, 60);
export const parseNomeModelo = (b: { nome?: unknown } | undefined) => nome(b?.nome, 80);

export function parseNovoModelo(b: { marcaId?: unknown; nome?: unknown } | undefined) {
  return { marcaId: parseUuid('marcaId', b?.marcaId), nome: parseNomeModelo(b) };
}

export interface TipoInput {
  nome: string;
  base: (typeof BASES)[number];
  /** Tipo pronto do front que esta linha renomeia; null = tipo do cliente. */
  padrao: string | null;
  icone: string | null;
}

export function parseTipo(b: Record<string, unknown> | undefined): TipoInput {
  const base = b?.base;
  if (!BASES.includes(base as TipoInput['base'])) erro(`"base" precisa ser um de: ${BASES.join(', ')}`);
  const padrao = b?.padrao === undefined || b?.padrao === null || b?.padrao === '' ? null : b.padrao;
  if (padrao !== null && (typeof padrao !== 'string' || !PADRAO.test(padrao))) erro('"padrao" precisa ser a chave de um tipo pronto (ex.: cavalo)');
  const icone = b?.icone === undefined || b?.icone === null || b?.icone === '' ? null : b.icone;
  if (icone !== null && (typeof icone !== 'string' || !ICONE.test(icone))) erro('"icone" precisa ser o nome de um ícone do catálogo (ex.: 02-sedan) ou null');
  return { nome: nome(b?.nome, 60), base: base as TipoInput['base'], padrao: padrao as string | null, icone: icone as string | null };
}
