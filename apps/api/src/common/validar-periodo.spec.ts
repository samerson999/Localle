import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { periodo, SEM_LIMITE } from './validar';

const DIA = 86_400_000;

describe('periodo', () => {
  it('com teto: recusa com 400 acima do máximo', () => {
    const ate = new Date('2026-10-28T12:00:00Z');
    const de = new Date(ate.getTime() - 94 * DIA);
    expect(() => periodo(de.toISOString(), ate.toISOString())).toThrow(BadRequestException);
  });

  // Regressão da sprint de 28/10/2026 (bug 3): a tela pedia `de = agora − 732 dias` sem `ate`; o `agora` da API vinha
  // alguns ms depois e o período passava do teto por milissegundos — "Não foi possível carregar combustível/ranking".
  it('SEM_LIMITE: aceita `de` antigo sem `ate`, que é o que a tela de combustível/ranking manda', () => {
    const de = new Date(Date.now() - 2 * 366 * DIA - 50).toISOString();
    const [inicio, fim] = periodo(de, undefined, 90, SEM_LIMITE);
    expect(inicio.toISOString()).toBe(de);
    expect(fim.getTime()).toBeGreaterThan(inicio.getTime());
    expect(() => periodo('2000-01-01T00:00:00Z', undefined, 90, SEM_LIMITE)).not.toThrow();
  });

  it('SEM_LIMITE continua recusando `de` depois de `ate`', () => {
    expect(() => periodo('2026-10-28T00:00:00Z', '2026-10-01T00:00:00Z', 90, SEM_LIMITE)).toThrow(BadRequestException);
  });
});
