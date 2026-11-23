import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedAddress, resolveAddresses } from './geocode';

// Sprint de monitoramento 28/10/2026, bug 5 (paliativo): posição sem endereço sai com as coordenadas, nunca em branco.
// O gap de fundo (endereço em todas as linhas) está em docs/ARQUITETURA-BACKEND.md § 2.6.
describe('endereço com coordenadas como alternativa', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cachedAddress sem cache devolve as coordenadas com 6 casas', () => {
    expect(cachedAddress(-8.0512345678, -34.9)).toBe('-8.051235, -34.900000');
  });

  it('resolveAddresses: serviço de endereço falhando → coordenadas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fora do ar')));
    expect(await resolveAddresses([[-7.5, -35.25]])).toEqual(['-7.500000, -35.250000']);
  });

  // regressão 23/11/2026: a fila de 1 consulta/s segurava o download do relatório por minutos com muitos pontos sem cache
  it('resolveAddresses: prazo esgotado → devolve na hora, com coordenadas no que faltou', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // serviço que nunca responde
    const t0 = Date.now();
    const r = await resolveAddresses([[-6.1, -35.1], [-6.2, -35.2], [-6.3, -35.3]], 50);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r).toEqual(['-6.100000, -35.100000', '-6.200000, -35.200000', '-6.300000, -35.300000']);
  });
});
