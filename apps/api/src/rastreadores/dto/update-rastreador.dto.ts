import { BadRequestException } from '@nestjs/common';
import { parseUuid } from '../../common/parse-uuid';

export class UpdateRastreadorDto {
  modeloId?: string;
  aparelhoId?: number;
  modelo?: string | null;
  protocolo?: string | null;
  numeroSerie?: string | null;
}

/** Número de série do aparelho: letras, números, hífen, ponto e barra, até 40; vazio = sem (igual ao IMEI). */
export function parseNumeroSerie(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw new BadRequestException('"numeroSerie" precisa ser texto');
  const v = valor.trim().toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9][A-Z0-9\-/.]{0,39}$/.test(v)) throw new BadRequestException('"numeroSerie" aceita letras, números, hífen, ponto e barra, até 40 caracteres');
  return v;
}

/** Sem class-validator no projeto: validação explícita, antes do service. */
export function parseUpdateRastreador(body: unknown): { modeloId?: string; aparelhoId?: number; modelo?: string | null; protocolo?: string | null; numeroSerie?: string | null } {
  const dto = (body ?? {}) as Record<string, unknown>;
  const result: { modeloId?: string; aparelhoId?: number; modelo?: string | null; protocolo?: string | null; numeroSerie?: string | null } = {};
  // trocar o modelo do catálogo (rastreador antigo sem modelo, ou modelo escolhido errado); ou um aparelho da lista do
  // Traccar ainda sem modelo, que vira modelo na troca
  if (dto.modeloId !== undefined && dto.aparelhoId !== undefined) throw new BadRequestException('Informe "modeloId" ou "aparelhoId", não os dois');
  if (dto.modeloId !== undefined) result.modeloId = parseUuid('modeloId', dto.modeloId);
  if (dto.aparelhoId !== undefined) {
    if (typeof dto.aparelhoId !== 'number' || !Number.isSafeInteger(dto.aparelhoId) || dto.aparelhoId <= 0) {
      throw new BadRequestException('"aparelhoId" precisa ser o id de um aparelho da lista do Traccar');
    }
    result.aparelhoId = dto.aparelhoId;
  }
  for (const campo of ['modelo', 'protocolo'] as const) {
    const valor = dto[campo];
    if (valor === undefined) continue;
    if (valor !== null && (typeof valor !== 'string' || valor.length > 60)) {
      throw new BadRequestException(`"${campo}" precisa ser texto de até 60 caracteres ou null`);
    }
    result[campo] = valor === null ? null : valor.trim() || null;
  }
  if (dto.numeroSerie !== undefined) result.numeroSerie = parseNumeroSerie(dto.numeroSerie);
  if (Object.keys(result).length === 0) throw new BadRequestException('Nada para atualizar');
  return result;
}
