import { BadRequestException } from '@nestjs/common';
import type { TraccarEventForward } from '../traccar-event.mapper';
import type { TraccarPositionPayload } from '../traccar-position.mapper';

// safe integer: acima de 2^53 o JS perde precisão e ids distintos colidiriam no dedup
const inteiroPositivo = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;
const numeroEntre = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
// faixa plausível: fora dela o timestamptz do Postgres estoura e a linha falharia no worker até o teto
const dataValida = (v: unknown) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return t >= Date.UTC(2000, 0, 1) && t <= Date.now() + 366 * 86_400_000;
};

/**
 * Payload externo é fronteira de confiança (.claude/rules/security.md, item 8): exige o mínimo para a
 * ingestão funcionar (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.1) e só o objeto `position`/`event` vai
 * para o inbox — o resto do corpo (dados do device etc.) é descartado.
 */
export function validarPosicaoForward(body: unknown): TraccarPositionPayload {
  const p = (body as { position?: Record<string, unknown> } | null)?.position;
  if (
    !p ||
    !inteiroPositivo(p.id) ||
    !inteiroPositivo(p.deviceId) ||
    !dataValida(p.fixTime) ||
    !dataValida(p.serverTime) ||
    typeof p.valid !== 'boolean' ||
    !numeroEntre(p.latitude, -90, 90) ||
    !numeroEntre(p.longitude, -180, 180)
  ) {
    throw new BadRequestException('Posição inválida');
  }
  return p as unknown as TraccarPositionPayload;
}

export function validarEventoForward(body: unknown): TraccarEventForward['event'] {
  const e = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!e || !inteiroPositivo(e.id) || !inteiroPositivo(e.deviceId) || typeof e.type !== 'string' || e.type.length > 50) {
    throw new BadRequestException('Evento inválido');
  }
  if (e.eventTime !== undefined && !dataValida(e.eventTime)) throw new BadRequestException('Evento inválido');
  if (e.serverTime !== undefined && !dataValida(e.serverTime)) throw new BadRequestException('Evento inválido');
  if (e.eventTime === undefined && e.serverTime === undefined) throw new BadRequestException('Evento inválido');
  if (e.positionId !== undefined && e.positionId !== 0 && !inteiroPositivo(e.positionId)) throw new BadRequestException('Evento inválido');
  return e as unknown as TraccarEventForward['event'];
}
