import { describe, expect, it } from 'vitest';
import { statusComunicacao } from './comunicacao-status';

describe('statusComunicacao', () => {
  const agora = new Date('2026-01-01T12:00:00Z');
  const horasAtras = (h: number) => new Date(agora.getTime() - h * 3600_000);

  it('ativo sem instalação vigente é sem_rastreador', () => {
    expect(
      statusComunicacao({ temRastreador: false, ultimoPacoteEm: null, ultimaPosicaoValidaEm: null }, 6, agora),
    ).toBe('sem_rastreador');
  });

  it('instalado e nenhum pacote ainda é aguardando', () => {
    expect(
      statusComunicacao({ temRastreador: true, ultimoPacoteEm: null, ultimaPosicaoValidaEm: null }, 6, agora),
    ).toBe('aguardando');
  });

  it('pacote e posição recentes é online; exatamente no limite ainda é online', () => {
    expect(
      statusComunicacao({ temRastreador: true, ultimoPacoteEm: horasAtras(1), ultimaPosicaoValidaEm: horasAtras(1) }, 6, agora),
    ).toBe('online');
    expect(
      statusComunicacao({ temRastreador: true, ultimoPacoteEm: horasAtras(6), ultimaPosicaoValidaEm: horasAtras(6) }, 6, agora),
    ).toBe('online');
  });

  it('último pacote além do limite é sem_sinal', () => {
    expect(
      statusComunicacao({ temRastreador: true, ultimoPacoteEm: horasAtras(7), ultimaPosicaoValidaEm: horasAtras(7) }, 6, agora),
    ).toBe('sem_sinal');
  });

  it('falando mas sem posição válida recente (ou nunca) é sem_gps', () => {
    expect(
      statusComunicacao({ temRastreador: true, ultimoPacoteEm: horasAtras(1), ultimaPosicaoValidaEm: horasAtras(10) }, 6, agora),
    ).toBe('sem_gps');
    expect(
      statusComunicacao({ temRastreador: true, ultimoPacoteEm: horasAtras(1), ultimaPosicaoValidaEm: null }, 6, agora),
    ).toBe('sem_gps');
  });
});
