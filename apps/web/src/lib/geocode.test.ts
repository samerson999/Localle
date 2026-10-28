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
});
