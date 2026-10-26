import { describe, expect, it } from 'vitest';
import { mapTraccarPosition } from './traccar-position.mapper';

describe('mapTraccarPosition', () => {
  const base = {
    id: 42,
    deviceId: 7,
    fixTime: '2026-01-01T12:00:00.000Z',
    serverTime: '2026-01-01T12:00:01.000Z',
    valid: true,
    latitude: -8.05,
    longitude: -34.88,
  };

  it('converte speed de nós para km/h', () => {
    const result = mapTraccarPosition({ ...base, speed: 10 });
    expect(result.speedKmh).toBeCloseTo(18.52, 5);
  });

  it('speed ausente vira null, não 0', () => {
    const result = mapTraccarPosition({ ...base });
    expect(result.speedKmh).toBeNull();
  });

  it('mantém odometer em metros (sem conversão)', () => {
    const result = mapTraccarPosition({ ...base, attributes: { odometer: 123456 } });
    expect(result.odometerM).toBe(123456);
  });

  it('attributes ausente não quebra e vira objeto vazio', () => {
    const result = mapTraccarPosition({ ...base });
    expect(result.attributes).toEqual({});
    expect(result.odometerM).toBeNull();
    expect(result.ignition).toBeNull();
  });

  it('lê ignition dos attributes quando é booleano', () => {
    const result = mapTraccarPosition({ ...base, attributes: { ignition: true } });
    expect(result.ignition).toBe(true);
  });

  it('preserva fixTime/serverTime como Date e valid como veio', () => {
    const result = mapTraccarPosition({ ...base, valid: false });
    expect(result.fixTime).toEqual(new Date('2026-01-01T12:00:00.000Z'));
    expect(result.serverTime).toEqual(new Date('2026-01-01T12:00:01.000Z'));
    expect(result.valid).toBe(false);
  });

  it('mapeia traccarDeviceId/traccarPositionId e coordenadas direto', () => {
    const result = mapTraccarPosition(base);
    expect(result.traccarDeviceId).toBe(7);
    expect(result.traccarPositionId).toBe(42);
    expect(result.latitude).toBe(-8.05);
    expect(result.longitude).toBe(-34.88);
  });

  it('extrai alarmes de attributes.alarm (um ou vários separados por vírgula, sem repetição)', () => {
    expect(mapTraccarPosition({ ...base, attributes: { alarm: 'sos' } }).alarms).toEqual(['sos']);
    expect(mapTraccarPosition({ ...base, attributes: { alarm: 'powerCut, sos,sos' } }).alarms).toEqual([
      'powerCut',
      'sos',
    ]);
  });

  it('descarta alarme fora do formato do catálogo e alarm que não é string', () => {
    expect(mapTraccarPosition({ ...base, attributes: { alarm: "x'; drop table--" } }).alarms).toEqual([]);
    expect(mapTraccarPosition({ ...base, attributes: { alarm: 42 } }).alarms).toEqual([]);
    expect(mapTraccarPosition({ ...base }).alarms).toEqual([]);
  });

  it('lê o protocolo da posição; ausente ou vazio vira null', () => {
    expect(mapTraccarPosition({ ...base, protocol: 'gt06' }).protocol).toBe('gt06');
    expect(mapTraccarPosition({ ...base, protocol: '  ' }).protocol).toBeNull();
    expect(mapTraccarPosition(base).protocol).toBeNull();
  });
});
