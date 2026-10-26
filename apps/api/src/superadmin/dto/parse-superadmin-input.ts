import { BadRequestException } from '@nestjs/common';
import { parseUuid } from '../../common/parse-uuid';

// Sem ValidationPipe global (main.ts), a entrada destas rotas é validada aqui, antes do service — mesmo
// padrão de `rastreadores/dto/update-rastreador.dto.ts` e do `rename` em `clients.controller.ts`.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseNome(v: unknown): string {
  const name = typeof v === 'string' ? v.trim() : '';
  if (name.length === 0 || name.length > 200) throw new BadRequestException('"name" precisa ter de 1 a 200 caracteres');
  return name;
}

/** Admin convidado: só o e-mail — a senha é definida por ele ao aceitar o convite. */
export function parseConvidado(v: unknown): { email: string } {
  const o = (v ?? {}) as { email?: unknown };
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) throw new BadRequestException('"email" inválido');
  return { email };
}

export function parseNovoCliente(v: unknown): { name: string; revendaId?: string; admin?: { email: string } } {
  const o = (v ?? {}) as { name?: unknown; revendaId?: unknown; admin?: unknown };
  return {
    name: parseNome(o.name),
    revendaId: o.revendaId === undefined || o.revendaId === null ? undefined : parseUuid('revendaId', o.revendaId),
    admin: o.admin === undefined || o.admin === null ? undefined : parseConvidado(o.admin),
  };
}

export function parseLimite(v: unknown, padrao: number, max: number): number {
  if (v === undefined || v === '') return padrao;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new BadRequestException(`"limit" precisa ser inteiro de 1 a ${max}`);
  return n;
}
