import { BadRequestException } from '@nestjs/common';
import { CODIGO } from '../codigo';

/** Corpo das rotas públicas por código (convite e redefinição): e-mail normalizado + 6 dígitos. */
export function parseCodigoEmail(body: { email?: unknown; codigo?: unknown } | undefined): { email: string; codigo: string } {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 200) throw new BadRequestException('"email" é obrigatório');
  const codigo = typeof body?.codigo === 'string' ? body.codigo.trim() : '';
  if (!CODIGO.test(codigo)) throw new BadRequestException('"codigo" precisa ter 6 dígitos');
  return { email, codigo };
}

export function parseSenha(v: unknown, campo: string): string {
  if (typeof v !== 'string' || v.length < 8 || v.length > 200) throw new BadRequestException(`"${campo}" precisa ter de 8 a 200 caracteres`);
  return v;
}
