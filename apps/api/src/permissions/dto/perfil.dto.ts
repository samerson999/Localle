import { BadRequestException } from '@nestjs/common';
import type { BaseRole } from '../perfis.repository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

function texto(v: unknown, campo: string, max: number, obrigatorio: boolean): string | null {
  if (v === undefined || v === null || v === '') {
    if (obrigatorio) throw new BadRequestException(`"${campo}" é obrigatório`);
    return null;
  }
  if (typeof v !== 'string') throw new BadRequestException(`"${campo}" precisa ser texto`);
  const t = v.trim();
  if (obrigatorio && !t) throw new BadRequestException(`"${campo}" é obrigatório`);
  if (t.length > max) throw new BadRequestException(`"${campo}" passa de ${max} caracteres`);
  return t || null;
}

/** `{ nome, descricao?, copiarDe: 'gestor' | 'operador' | <id de perfil> }` */
export function parseNovoPerfil(body: unknown): { nome: string; descricao: string | null; copiarDe: BaseRole | string } {
  const o = (body ?? {}) as Record<string, unknown>;
  const copiarDe = o.copiarDe;
  if (copiarDe !== 'gestor' && copiarDe !== 'operador' && !isUuid(copiarDe)) {
    throw new BadRequestException('"copiarDe" precisa ser "gestor", "operador" ou o id de um perfil');
  }
  return { nome: texto(o.nome, 'nome', 60, true)!, descricao: texto(o.descricao, 'descricao', 200, false), copiarDe };
}

export function parseRenomearPerfil(body: unknown): { nome: string; descricao: string | null } {
  const o = (body ?? {}) as Record<string, unknown>;
  return { nome: texto(o.nome, 'nome', 60, true)!, descricao: texto(o.descricao, 'descricao', 200, false) };
}

/** Perfil de um membro da equipe: papel embutido (`gestor`/`operador`) ou id de perfil próprio do cliente. */
export function parsePerfilDoMembro(v: unknown): { role: BaseRole; perfilId: null } | { role: null; perfilId: string } {
  if (v === 'gestor' || v === 'operador') return { role: v, perfilId: null };
  if (isUuid(v)) return { role: null, perfilId: v };
  throw new BadRequestException('"perfil" precisa ser "gestor", "operador" ou o id de um perfil');
}
