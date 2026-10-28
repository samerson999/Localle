import { BadRequestException } from '@nestjs/common';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['gestor', 'operador'] as const;

/** Convite de membro da equipe do cliente. Nunca "admin" — o Admin só nasce pelo superadmin (src/superadmin/). */
export function parseConviteMembro(body: unknown): { email: string; role: 'gestor' | 'operador' } {
  const o = (body ?? {}) as { email?: unknown; role?: unknown };
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) throw new BadRequestException('"email" inválido');
  if (!ROLES.includes(o.role as (typeof ROLES)[number])) throw new BadRequestException('"role" precisa ser "gestor" ou "operador"');
  return { email, role: o.role as 'gestor' | 'operador' };
}
