import { afterEach, describe, expect, it, vi } from 'vitest';
import { TraccarClient } from './traccar-client';

const config = { url: 'http://traccar.fake', user: 'u', password: 'p' };

// O "400 Bad Request" sozinho não dizia por que o Traccar recusou (HML, 28/10/2026: cadastro do JR12 com IMEI já usado).
describe('TraccarClient — erro com o motivo do Traccar', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('inclui o corpo do erro (uma linha, curto) na mensagem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Duplicate entry\n  for key "uniqueid"', { status: 400, statusText: 'Bad Request' })));
    await expect(new TraccarClient().createDevice(config, { name: 'x', uniqueId: '1' })).rejects.toThrow(
      'Traccar POST /api/devices falhou: 400 Bad Request — Duplicate entry for key "uniqueid"',
    );
  });

  it('sem corpo, só status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401, statusText: 'Unauthorized' })));
    await expect(new TraccarClient().listDevices(config)).rejects.toThrow(/401 Unauthorized$/);
  });

  it('corpo longo é cortado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(5000), { status: 500, statusText: 'Server Error' })));
    const err = await new TraccarClient().listDevices(config).catch((e: Error) => e);
    expect((err as Error).message.length).toBeLessThan(400);
  });
});
