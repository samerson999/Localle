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

// Valor de campo para o motivo da recusa: curto e só dos campos de identificação/tempo. Coordenada não entra no
// motivo (dado de localização do cliente), só o nome do campo (.claude/rules/observability.md).
const mostrar = (v: unknown) => (v === undefined ? 'ausente' : JSON.stringify(v)?.slice(0, 40) ?? String(v));

/**
 * Payload externo é fronteira de confiança (.claude/rules/security.md, item 8): exige o mínimo para a
 * ingestão funcionar (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.1) e só o objeto `position`/`event` vai
 * para o inbox — o resto do corpo (dados do device etc.) é descartado. A mensagem da recusa diz quais campos
 * falharam: o controller a loga, para o 400 não ser um descarte silencioso.
 */
export function validarPosicaoForward(body: unknown): TraccarPositionPayload {
  const p = (body as { position?: Record<string, unknown> } | null)?.position;
  if (!p || typeof p !== 'object') throw new BadRequestException('Posição inválida: sem objeto position');
  const motivos = [
    !inteiroPositivo(p.id) && `id=${mostrar(p.id)}`,
    !inteiroPositivo(p.deviceId) && `deviceId=${mostrar(p.deviceId)}`,
    !dataValida(p.fixTime) && `fixTime=${mostrar(p.fixTime)}`,
    !dataValida(p.serverTime) && `serverTime=${mostrar(p.serverTime)}`,
    typeof p.valid !== 'boolean' && `valid=${mostrar(p.valid)}`,
    !numeroEntre(p.latitude, -90, 90) && 'latitude',
    !numeroEntre(p.longitude, -180, 180) && 'longitude',
  ].filter(Boolean);
  if (motivos.length) throw new BadRequestException(`Posição inválida: ${motivos.join(', ')}`);
  return p as unknown as TraccarPositionPayload;
}

export function validarEventoForward(body: unknown): TraccarEventForward['event'] {
  const e = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!e || typeof e !== 'object') throw new BadRequestException('Evento inválido: sem objeto event');
  const motivos = [
    !inteiroPositivo(e.id) && `id=${mostrar(e.id)}`,
    !inteiroPositivo(e.deviceId) && `deviceId=${mostrar(e.deviceId)}`,
    (typeof e.type !== 'string' || e.type.length > 50) && `type=${mostrar(e.type)}`,
    e.eventTime !== undefined && !dataValida(e.eventTime) && `eventTime=${mostrar(e.eventTime)}`,
    e.serverTime !== undefined && !dataValida(e.serverTime) && `serverTime=${mostrar(e.serverTime)}`,
    e.eventTime === undefined && e.serverTime === undefined && 'eventTime/serverTime ausentes',
    e.positionId !== undefined && e.positionId !== 0 && !inteiroPositivo(e.positionId) && `positionId=${mostrar(e.positionId)}`,
  ].filter(Boolean);
  if (motivos.length) throw new BadRequestException(`Evento inválido: ${motivos.join(', ')}`);
  return e as unknown as TraccarEventForward['event'];
}
