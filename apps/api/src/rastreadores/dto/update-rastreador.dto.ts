import { BadRequestException } from '@nestjs/common';
import { parseUuid } from '../../common/parse-uuid';

export class UpdateRastreadorDto {
  modeloId?: string;
  modelo?: string | null;
  protocolo?: string | null;
}

/** Sem class-validator no projeto: validação explícita, antes do service. */
export function parseUpdateRastreador(body: unknown): { modeloId?: string; modelo?: string | null; protocolo?: string | null } {
  const dto = (body ?? {}) as Record<string, unknown>;
  const result: { modeloId?: string; modelo?: string | null; protocolo?: string | null } = {};
  // trocar o modelo do catálogo (rastreador antigo sem modelo, ou modelo escolhido errado)
  if (dto.modeloId !== undefined) result.modeloId = parseUuid('modeloId', dto.modeloId);
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
