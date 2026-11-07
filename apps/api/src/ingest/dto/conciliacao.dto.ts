import { BadRequestException } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Teto de um pedido manual: período maior vira vários pedidos (cada um é uma consulta por janela ao Traccar). */
export const REEXECUCAO_MAX_DIAS = 31;

export interface ReexecucaoConciliacao {
  rastreadorId?: string;
  traccarDeviceId?: number;
  de: Date;
  ate: Date;
}

/** `{ rastreadorId | traccarDeviceId, de, ate }` — datas ISO; exatamente um dos dois identificadores. */
export function validarReexecucao(body: unknown): ReexecucaoConciliacao {
  const b = (body ?? {}) as Record<string, unknown>;
  const temRastreador = b.rastreadorId !== undefined;
  const temDevice = b.traccarDeviceId !== undefined;
  if (temRastreador === temDevice) throw new BadRequestException('Informe rastreadorId ou traccarDeviceId (um dos dois)');
  if (temRastreador && (typeof b.rastreadorId !== 'string' || !UUID.test(b.rastreadorId))) {
    throw new BadRequestException('rastreadorId inválido');
  }
  if (temDevice && !(Number.isSafeInteger(b.traccarDeviceId) && (b.traccarDeviceId as number) > 0)) {
    throw new BadRequestException('traccarDeviceId inválido');
  }
  const de = typeof b.de === 'string' ? new Date(b.de) : null;
  const ate = typeof b.ate === 'string' ? new Date(b.ate) : null;
  if (!de || !ate || Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) throw new BadRequestException('de/ate devem ser datas ISO');
  if (de >= ate) throw new BadRequestException('de deve ser anterior a ate');
  if (ate.getTime() - de.getTime() > REEXECUCAO_MAX_DIAS * 86_400_000) {
    throw new BadRequestException(`Período máximo de ${REEXECUCAO_MAX_DIAS} dias por pedido`);
  }
  if (ate.getTime() > Date.now() + 3600_000) throw new BadRequestException('ate no futuro');
  return {
    ...(temRastreador ? { rastreadorId: b.rastreadorId as string } : { traccarDeviceId: b.traccarDeviceId as number }),
    de,
    ate,
  };
}
