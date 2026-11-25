import { BadRequestException } from '@nestjs/common';
import { parseSenha } from '../../auth/dto/parse-codigo';
import { isUuid, parsePerfilDoMembro } from '../../permissions/dto/perfil.dto';
import type { EscopoUsuario } from '../users.repository';

/** Mesmo formato da constraint `users_username_formato`: 3 a 40 caracteres, minúsculas, números, ponto, hífen e sublinhado. */
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const MAX_IDS = 500;

export function parseUsername(v: unknown): string {
  const u = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!USERNAME.test(u)) {
    throw new BadRequestException('"usuario" precisa ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado, sem espaço');
  }
  return u;
}

function ids(v: unknown, campo: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > MAX_IDS || !v.every(isUuid)) throw new BadRequestException(`"${campo}" precisa ser uma lista de ids`);
  return [...new Set(v as string[])];
}

/**
 * `{ restrito, semGrupo?, grupoIds?, operacaoIds? }`. Restrito sem nada marcado não vê veículo nenhum — recusado, para
 * o admin não criar sem querer um acesso que abre tudo vazio.
 */
export function parseEscopo(body: unknown): EscopoUsuario {
  const o = (body ?? {}) as Record<string, unknown>;
  if (typeof o.restrito !== 'boolean') throw new BadRequestException('"escopo.restrito" precisa ser verdadeiro ou falso');
  if (!o.restrito) return { restrito: false, semGrupo: false, grupoIds: [], operacaoIds: [] };
  const e = { restrito: true, semGrupo: o.semGrupo === true, grupoIds: ids(o.grupoIds, 'escopo.grupoIds'), operacaoIds: ids(o.operacaoIds, 'escopo.operacaoIds') };
  if (!e.semGrupo && e.grupoIds.length === 0 && e.operacaoIds.length === 0) {
    throw new BadRequestException('Marque ao menos um grupo, uma operação ou "veículos sem grupo/operação"');
  }
  return e;
}

/**
 * Novo membro da equipe do cliente: `{ usuario, senha, perfil, escopo? }`. Nunca "admin" — o Admin só nasce pelo
 * superadmin (src/superadmin/). Sem escopo = vê a frota toda. O e-mail a própria pessoa informa no primeiro acesso.
 */
export function parseNovoMembro(body: unknown) {
  const o = (body ?? {}) as Record<string, unknown>;
  return {
    username: parseUsername(o.usuario),
    senha: parseSenha(o.senha, 'senha'),
    perfil: parsePerfilDoMembro(o.perfil),
    escopo: o.escopo === undefined ? parseEscopo({ restrito: false }) : parseEscopo(o.escopo),
  };
}
