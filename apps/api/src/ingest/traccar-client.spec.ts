import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

// Sem tempo limite, um Traccar com o socket aberto e sem resposta prendia o poller, a conciliação e requisições de usuário.
describe('TraccarClient — tempo limite e caminho único', () => {
  let servidor: Server;
  let url = '';
  const env = process.env.TRACCAR_TIMEOUT_MS;

  beforeAll(async () => {
    // servidor HTTP real que só responde depois de 2 s
    servidor = createServer((_req, res) => setTimeout(() => res.end('[]'), 2000));
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', () => ok()));
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    servidor.closeAllConnections();
    await new Promise((ok) => servidor.close(ok));
    process.env.TRACCAR_TIMEOUT_MS = env;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('desiste no tempo limite padrão (TRACCAR_TIMEOUT_MS) com mensagem que diz a rota', async () => {
    process.env.TRACCAR_TIMEOUT_MS = '200';
    const inicio = Date.now();
    await expect(new TraccarClient().listDevices({ url, user: 'u', password: 'p' })).rejects.toThrow('Traccar GET /api/devices sem resposta em 200 ms');
    expect(Date.now() - inicio).toBeLessThan(1500);
  });

  it('o tempo limite passado pela chamada vale mais que o padrão', async () => {
    process.env.TRACCAR_TIMEOUT_MS = '60000';
    await expect(new TraccarClient().positionsBetween({ url, user: 'u', password: 'p' }, 1, new Date(0), new Date(1), 150)).rejects.toThrow('sem resposta em 150 ms');
  });

  it('Traccar fora do ar vira erro com a rota, não exceção crua do fetch', async () => {
    await expect(new TraccarClient().serverVersion({ url: 'http://127.0.0.1:1', user: 'u', password: 'p' })).rejects.toThrow(/^Traccar GET \/api\/server inacessível/);
  });

  it('apagar device já apagado (404) conta como apagado; outro erro não', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' })));
    await expect(new TraccarClient().deleteDevice(config, 7)).resolves.toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' })));
    await expect(new TraccarClient().deleteDevice(config, 7)).rejects.toThrow('Traccar DELETE /api/devices/7 falhou: 503');
  });

  it('enviar comando: 202 = enfileirado no Traccar, 200 = entregue; id do comando quando vier', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 9 }), { status: 202 })));
    await expect(new TraccarClient().sendCommand(config, { deviceId: 1, type: 'engineStop' })).resolves.toEqual({ queued: true, id: 9 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));
    await expect(new TraccarClient().sendCommand(config, { deviceId: 1, type: 'engineStop' })).resolves.toEqual({ queued: false, id: null });
  });
});
