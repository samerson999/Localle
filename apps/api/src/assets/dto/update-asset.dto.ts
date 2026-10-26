import { BadRequestException } from '@nestjs/common';
import { parseUuid } from '../../common/parse-uuid';
import type { AssetStatus } from '../asset.entity';

const STATUSES: AssetStatus[] = ['ativo', 'vendido', 'baixado'];

export class UpdateAssetDto {
  plate?: string;
  status?: AssetStatus;
  /** Motorista do cadastro do veículo; `null` limpa o vínculo. */
  motoristaId?: string | null;
}

/** Sem class-validator no projeto: a validação de entrada é explícita, antes de chegar no repository. */
export function parseUpdateAsset(body: unknown): { plate: string | null; status: AssetStatus | null; motoristaId?: string | null } {
  const dto = (body ?? {}) as Record<string, unknown>;
  const plate = dto.plate === undefined ? null : parsePlate(dto.plate);
  let status: AssetStatus | null = null;
  if (dto.status !== undefined) {
    if (!STATUSES.includes(dto.status as AssetStatus)) {
      throw new BadRequestException(`"status" precisa ser um de: ${STATUSES.join(', ')}`);
    }
    status = dto.status as AssetStatus;
  }
  let motoristaId: string | null | undefined;
  if (dto.motoristaId !== undefined) motoristaId = dto.motoristaId === null || dto.motoristaId === '' ? null : parseUuid('motoristaId', dto.motoristaId);
  if (plate === null && status === null && motoristaId === undefined) throw new BadRequestException('Nada para atualizar');
  return { plate, status, motoristaId };
}

export function parsePlate(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 20) {
    throw new BadRequestException('"plate" precisa ser texto de 1 a 20 caracteres');
  }
  return value.trim().toUpperCase();
}
