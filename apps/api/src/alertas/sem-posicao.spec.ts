import { describe, expect, it } from 'vitest';
import { nivelSemPosicao } from './sem-posicao';

describe('nivelSemPosicao', () => {
  const agora = new Date('2026-11-11T12:00:00Z');
  const horasAtras = (h: number) => new Date(agora.getTime() - h * 3600_000);

  it('abaixo de 4 h não alerta', () => {
    expect(nivelSemPosicao(horasAtras(3.99), agora)).toBeNull();
  });

  it('4 h baixo, 12 h médio, 24 h crítico (limite inclusivo)', () => {
    expect(nivelSemPosicao(horasAtras(4), agora)).toBe('baixa');
    expect(nivelSemPosicao(horasAtras(11.9), agora)).toBe('baixa');
    expect(nivelSemPosicao(horasAtras(12), agora)).toBe('media');
    expect(nivelSemPosicao(horasAtras(23.9), agora)).toBe('media');
    expect(nivelSemPosicao(horasAtras(24), agora)).toBe('alta');
    expect(nivelSemPosicao(horasAtras(500), agora)).toBe('alta');
  });
});
