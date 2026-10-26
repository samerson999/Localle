/** Payload cru de `GET /api/positions` do Traccar (campos relevantes só). */
export interface TraccarPositionPayload {
  id: number;
  deviceId: number;
  fixTime: string;
  serverTime: string;
  valid: boolean;
  latitude: number;
  longitude: number;
  speed?: number; // nós
  course?: number;
  altitude?: number;
  /** Protocolo com que o Traccar decodificou a posição (ex.: "gt06", "suntech") — definido pela porta. */
  protocol?: string;
  attributes?: Record<string, unknown>;
}

export interface NormalizedPosition {
  traccarDeviceId: number;
  traccarPositionId: number;
  fixTime: Date;
  serverTime: Date;
  valid: boolean;
  longitude: number;
  latitude: number;
  speedKmh: number | null;
  course: number | null;
  altitude: number | null;
  odometerM: number | null;
  ignition: boolean | null;
  /** Alarmes do aparelho (`attributes.alarm`), já validados — viram linhas em `eventos`. */
  alarms: string[];
  /** null quando o Traccar não informa. */
  protocol?: string | null;
  attributes: Record<string, unknown>;
}

const KNOTS_TO_KMH = 1.852;

// docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.3: o Traccar padroniza `attributes.alarm` em identificadores
// camelCase (`sos`, `powerCut`, `lowBattery`...) e alguns protocolos mandam mais de um separado por
// vírgula. Payload externo é fronteira de confiança: só passa o formato do catálogo, o resto é descartado.
const ALARM_PATTERN = /^[a-zA-Z]{1,40}$/;

export function parseAlarms(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const alarms = raw
    .split(',')
    .map((a) => a.trim())
    .filter((a) => ALARM_PATTERN.test(a));
  return [...new Set(alarms)];
}

/**
 * docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.2: `speed` do Traccar vem em nós, convertido aqui para
 * km/h (única conversão feita na ingestão — `odometer` fica em metros no banco de propósito, para não
 * acumular erro de arredondamento em relatórios de km por soma).
 */
export function mapTraccarPosition(raw: TraccarPositionPayload): NormalizedPosition {
  const attributes = raw.attributes ?? {};
  return {
    traccarDeviceId: raw.deviceId,
    traccarPositionId: raw.id,
    fixTime: new Date(raw.fixTime),
    serverTime: new Date(raw.serverTime),
    valid: raw.valid,
    longitude: raw.longitude,
    latitude: raw.latitude,
    speedKmh: typeof raw.speed === 'number' ? raw.speed * KNOTS_TO_KMH : null,
    course: raw.course ?? null,
    altitude: raw.altitude ?? null,
    odometerM: typeof attributes.odometer === 'number' ? (attributes.odometer as number) : null,
    ignition: typeof attributes.ignition === 'boolean' ? (attributes.ignition as boolean) : null,
    alarms: parseAlarms(attributes.alarm),
    protocol: typeof raw.protocol === 'string' && raw.protocol.trim() ? raw.protocol.trim().slice(0, 64) : null,
    attributes,
  };
}
