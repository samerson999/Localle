import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { validarEventoForward, validarPosicaoForward } from './traccar-forward.dto';

const posicao = (o: Record<string, unknown> = {}) => ({
  position: { id: 1, deviceId: 2, fixTime: '2026-01-01T12:00:00Z', serverTime: '2026-01-01T12:00:01Z', valid: true, latitude: -8, longitude: -34, ...o },
});
const evento = (o: Record<string, unknown> = {}) => ({ event: { id: 1, deviceId: 2, type: 'ignitionOn', eventTime: '2026-01-01T12:00:00Z', ...o } });

// Regressões do pentest: valores que passavam na validação e quebravam no Postgres, deixando linha
// "venenosa" no inbox até o teto de tentativas.
describe('validação do Forwarding do Traccar', () => {
  it('aceita payload normal', () => {
    expect(validarPosicaoForward(posicao()).id).toBe(1);
    expect(validarEventoForward(evento()).type).toBe('ignitionOn');
  });

  it('recusa data fora da faixa do timestamptz/plausível', () => {
    expect(() => validarPosicaoForward(posicao({ fixTime: '-200000-01-01T00:00:00Z' }))).toThrow(BadRequestException);
    expect(() => validarEventoForward(evento({ eventTime: '1970-01-01T00:00:00Z' }))).toThrow(BadRequestException);
  });

  it('recusa serverTime inválido e evento sem nenhuma data', () => {
    expect(() => validarEventoForward(evento({ eventTime: undefined, serverTime: 'lixo' }))).toThrow(BadRequestException);
    expect(() => validarEventoForward(evento({ eventTime: undefined }))).toThrow(BadRequestException);
  });

  it('recusa id acima de 2^53 (perde precisão e colidiria no dedup) e positionId inválido', () => {
    expect(() => validarPosicaoForward(posicao({ id: 1e300 }))).toThrow(BadRequestException);
    expect(() => validarPosicaoForward(posicao({ deviceId: 2 ** 60 }))).toThrow(BadRequestException);
    expect(() => validarEventoForward(evento({ positionId: 'x' }))).toThrow(BadRequestException);
    expect(validarEventoForward(evento({ positionId: 0 })).positionId).toBe(0);
  });

  it('diz na mensagem quais campos falharam, sem expor coordenada (o controller loga o motivo)', () => {
    expect(() => validarPosicaoForward(posicao({ id: 0, latitude: 999 }))).toThrow('Posição inválida: id=0, latitude');
    expect(() => validarPosicaoForward(posicao({ fixTime: undefined }))).toThrow('fixTime=ausente');
    expect(() => validarPosicaoForward({})).toThrow('sem objeto position');
    expect(() => validarEventoForward(evento({ type: 7 }))).toThrow('Evento inválido: type=7');
  });
});
