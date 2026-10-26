import { BadRequestException } from '@nestjs/common';
import type { ComandoTipo } from '@localle/shared/realtime';
import { parseUuid } from '../../common/parse-uuid';

export const TIPOS: ComandoTipo[] = ['engineStop', 'engineResume', 'positionSingle'];
/** Tipos que mudam o estado físico do veículo: permissão própria e condições de segurança (§ 4.6). */
export const TIPOS_FISICOS: ComandoTipo[] = ['engineStop', 'engineResume'];
export const OPOSTO: Partial<Record<ComandoTipo, ComandoTipo>> = { engineStop: 'engineResume', engineResume: 'engineStop' };

export interface ComandoInput {
  assetId: string;
  tipo: ComandoTipo;
  motivo: string | null;
}

export function parseComando(body: unknown): ComandoInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const assetId = parseUuid('assetId', b.assetId);
  if (!TIPOS.includes(b.tipo as ComandoTipo)) throw new BadRequestException(`"tipo" precisa ser um de: ${TIPOS.join(', ')}`);
  const tipo = b.tipo as ComandoTipo;
  const motivo = typeof b.motivo === 'string' && b.motivo.trim() ? b.motivo.trim().slice(0, 300) : null;
  if (TIPOS_FISICOS.includes(tipo) && !motivo) throw new BadRequestException('"motivo" é obrigatório para bloquear ou desbloquear');
  return { assetId, tipo, motivo };
}
