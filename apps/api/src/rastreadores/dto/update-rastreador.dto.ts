import { BadRequestException } from '@nestjs/common';

export class UpdateRastreadorDto {
  modelo?: string | null;
  protocolo?: string | null;
}

/** Sem class-validator no projeto: validação explícita, antes do service. */
export function parseUpdateRastreador(body: unknown): { modelo?: string | null; protocolo?: string | null } {
  const dto = (body ?? {}) as Record<string, unknown>;
  const result: { modelo?: string | null; protocolo?: string | null } = {};
  for (const campo of ['modelo', 'protocolo'] as const) {
    const valor = dto[campo];
    if (valor === undefined) continue;
    if (valor !== null && (typeof valor !== 'string' || valor.length > 60)) {
      throw new BadRequestException(`"${campo}" precisa ser texto de até 60 caracteres ou null`);
    }
    result[campo] = valor === null ? null : valor.trim() || null;
  }
  if (Object.keys(result).length === 0) throw new BadRequestException('Nada para atualizar');
  return result;
}
