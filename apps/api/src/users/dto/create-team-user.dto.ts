import { BadRequestException } from '@nestjs/common';
import { parsePerfilDoMembro } from '../../permissions/dto/perfil.dto';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['gestor', 'operador'] as const;

/**
 * Convite de membro da equipe do cliente. Nunca "admin" — o Admin só nasce pelo superadmin (src/superadmin/).
 * `perfil` (gestor, operador ou id de perfil próprio) substitui `role`; `role` continua aceito.
 */
export function parseConviteMembro(body: unknown): { email: string; perfil: ReturnType<typeof parsePerfilDoMembro> } {
  const o = (body ?? {}) as { email?: unknown; role?: unknown; perfil?: unknown };
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) throw new BadRequestException('"email" inválido');
  if (o.perfil !== undefined) return { email, perfil: parsePerfilDoMembro(o.perfil) };
  if (!ROLES.includes(o.role as (typeof ROLES)[number])) throw new BadRequestException('"role" precisa ser "gestor" ou "operador"');
  return { email, perfil: { role: o.role as 'gestor' | 'operador', perfilId: null } };
}
