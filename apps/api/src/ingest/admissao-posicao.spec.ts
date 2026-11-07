import { describe, expect, it } from 'vitest';
import { admitirPosicao, TOLERANCIA_RELOGIO_MS } from './admissao-posicao';

const bruta = (o: Record<string, unknown> = {}) => ({
  id: 10, deviceId: 2, fixTime: '2026-11-05T12:00:00.000Z', serverTime: '2026-11-05T12:00:02.000Z', valid: true,
  latitude: -8.05, longitude: -34.9, speed: 10, attributes: { ignition: true, odometer: 1500, alarm: 'sos' }, ...o,
});

describe('admissão de posição (porta única)', () => {
  it('posição normal: validada, normalizada (nós → km/h) e com hora confiável', () => {
    const r = admitirPosicao(bruta());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.posicao).toMatchObject({ traccarPositionId: 10, speedKmh: 18.52, ignition: true, odometerM: 1500, alarms: ['sos'], horaConfiavel: true });
  });

  it('relógio do aparelho adiantado além da tolerância: admitida, mas com hora não confiável', () => {
    const noLimite = admitirPosicao(bruta({ fixTime: new Date(Date.parse('2026-11-05T12:00:02Z') + TOLERANCIA_RELOGIO_MS).toISOString() }));
    expect(noLimite.ok && noLimite.posicao.horaConfiavel).toBe(true);
    const adiantada = admitirPosicao(bruta({ fixTime: '2027-03-01T00:00:00.000Z' }));
    expect(adiantada.ok && adiantada.posicao.horaConfiavel).toBe(false);
  });

  it('posição atrasada (buffer do aparelho) é confiável: atraso não é relógio errado', () => {
    const r = admitirPosicao(bruta({ fixTime: '2026-11-01T08:00:00.000Z' }));
    expect(r.ok && r.posicao.horaConfiavel).toBe(true);
  });

  it('formato inválido (o polling não validava nada) é recusado com o motivo, sem exceção', () => {
    expect(admitirPosicao(bruta({ latitude: 999 }))).toEqual({ ok: false, motivo: 'Posição inválida: latitude' });
    expect(admitirPosicao(null)).toEqual({ ok: false, motivo: 'Posição inválida: sem objeto position' });
    expect(admitirPosicao(bruta({ fixTime: '2999-01-01T00:00:00Z' })).ok).toBe(false);
  });
});
