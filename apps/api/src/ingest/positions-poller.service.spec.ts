import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { InboxRepository } from './inbox.repository';
import type { TraccarClient } from './traccar-client';
import { PositionsPollerService } from './positions-poller.service';

const config = { url: 'http://traccar.fake', user: 'u', password: 'p' };

describe('PositionsPollerService', () => {
  it('não empilha consultas: enquanto uma não volta, as seguintes são puladas (com aviso)', async () => {
    let liberar!: (v: unknown[]) => void;
    const fetchPositions = vi.fn(() => new Promise<unknown[]>((ok) => (liberar = ok)));
    const inserir = vi.fn();
    const poller = new PositionsPollerService({ fetchPositions } as unknown as TraccarClient, { inserir } as unknown as InboxRepository);
    const logger = { warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    const primeira = poller.pollOnce(config, logger);
    await poller.pollOnce(config, logger);
    await poller.pollOnce(config, logger);
    expect(fetchPositions).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(2);

    liberar([{ id: 1 }]);
    await primeira;
    // vai para o inbox (fila única), marcado com a origem
    expect(inserir).toHaveBeenCalledWith('posicao', { position: { id: 1 }, origem: 'polling' });
    // terminada a primeira, a próxima volta consulta de novo
    const segunda = poller.pollOnce(config, logger);
    liberar([]);
    await segunda;
    expect(fetchPositions).toHaveBeenCalledTimes(2);
  });

  it('falha do Traccar libera a trava para a próxima volta', async () => {
    const fetchPositions = vi.fn().mockRejectedValueOnce(new Error('Traccar GET /api/positions sem resposta em 15000 ms')).mockResolvedValue([]);
    const poller = new PositionsPollerService({ fetchPositions } as unknown as TraccarClient, { inserir: vi.fn() } as unknown as InboxRepository);
    const logger = { warn: vi.fn(), error: vi.fn() } as unknown as Logger;
    await poller.pollOnce(config, logger);
    await poller.pollOnce(config, logger);
    expect(fetchPositions).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('sem resposta em 15000 ms'));
  });
});
