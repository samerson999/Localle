import { BadRequestException } from '@nestjs/common';

/** Posição na listagem: chave de ordenação + id (desempate; uuid ou número). Opaco para o integrador (base64url). */
export interface Cursor {
  k: string;
  id: string;
}

export interface Pagina<T> {
  dados: T[];
  /** `null` quando não há mais páginas. */
  proximoCursor: string | null;
}

const ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{1,19})$/i;
const erro = (codigo: string, message: string) => new BadRequestException({ statusCode: 400, codigo, message });

export function lerLimite(v: unknown, padrao = 100, max = 500): number {
  if (v === undefined || v === '') return padrao;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) throw erro('limite_invalido', `"limite" precisa ser um inteiro de 1 a ${max}`);
  return n;
}

export function lerCursor(v: unknown): Cursor | null {
  if (v === undefined || v === '') return null;
  try {
    const c = JSON.parse(Buffer.from(String(v), 'base64url').toString('utf8'));
    if (typeof c?.k === 'string' && c.k.length <= 200 && typeof c?.id === 'string' && ID.test(c.id)) return { k: c.k, id: c.id };
  } catch {
    /* cai no erro abaixo */
  }
  throw erro('cursor_invalido', '"cursor" inválido — use o "proximoCursor" da página anterior');
}

/** Recebe `limite + 1` linhas (a sobra diz se há próxima página) e monta a resposta. */
export function montarPagina<R, T>(linhas: R[], limite: number, chave: (r: R) => Cursor, mapear: (r: R) => T): Pagina<T> {
  const temMais = linhas.length > limite;
  const pagina = temMais ? linhas.slice(0, limite) : linhas;
  const ultimo = pagina[pagina.length - 1];
  return {
    dados: pagina.map(mapear),
    proximoCursor: temMais && ultimo ? Buffer.from(JSON.stringify(chave(ultimo)), 'utf8').toString('base64url') : null,
  };
}

/**
 * Cursor de série temporal (chave = instante ISO): `{ ts, id }` para o keyset, ou 400 se a chave não for uma data. O
 * instante tem milissegundos e o Postgres guarda microssegundos: as consultas ordenam e comparam por
 * `date_trunc('milliseconds', …)`, senão linhas do mesmo milissegundo seriam puladas entre páginas.
 */
export function aposInstante(c: Cursor | null): { ts: Date; id: string } | null {
  if (!c) return null;
  const t = Date.parse(c.k);
  if (!Number.isFinite(t)) throw erro('cursor_invalido', '"cursor" inválido — use o "proximoCursor" da página anterior');
  return { ts: new Date(t), id: c.id };
}
