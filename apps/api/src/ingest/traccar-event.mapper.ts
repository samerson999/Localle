/** Corpo do `event.forward` do Traccar (`event.forward.type=json`) — campos usados só. */
export interface TraccarEventForward {
  event: {
    id: number;
    type: string;
    deviceId: number;
    positionId?: number;
    eventTime?: string;
    serverTime?: string;
    attributes?: Record<string, unknown>;
  };
}

export interface NormalizedEvent {
  traccarDeviceId: number;
  traccarEventId: number;
  traccarPositionId: number | null;
  tipo: string;
  ts: Date;
}

/**
 * Quais tipos do Traccar viram linha em `eventos` (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.3):
 * - `alarm` NÃO: o alarme já chega dentro da posição (`attributes.alarm`) e é gravado pela ingestão de
 *   posições — aceitar aqui também duplicaria cada alarme.
 * - `deviceOnline`/`deviceOffline`/`deviceUnknown`: diagnóstico de socket, não a regra "sem sinal" do
 *   produto (que é do backend, por cliente) — fica fora.
 * - `geofence*` e `deviceOverspeed`: cercas e limite do Traccar ficam desligados; a regra é do backend.
 * - `commandResult`: tratado pelo módulo de comandos (inbox.worker.ts desvia antes de chegar aqui).
 */
const TIPOS_GRAVADOS = new Set(['ignitionOn', 'ignitionOff', 'deviceMoving', 'deviceStopped', 'maintenance']);

/** `null` = tipo reconhecido mas que não vira evento (ignorado de propósito, não é erro). */
export function mapTraccarEvent(raw: TraccarEventForward): NormalizedEvent | null {
  const e = raw.event;
  if (!TIPOS_GRAVADOS.has(e.type)) return null;
  return {
    traccarDeviceId: e.deviceId,
    traccarEventId: e.id,
    traccarPositionId: typeof e.positionId === 'number' && e.positionId > 0 ? e.positionId : null,
    tipo: e.type,
    ts: new Date((e.eventTime ?? e.serverTime)!), // um dos dois é exigido na validação do endpoint
  };
}
