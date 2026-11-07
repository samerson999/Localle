import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InboxRepository } from './inbox.repository';
import { readTraccarConfig, TraccarClient } from './traccar-client';

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Sobe sozinho quando `TRACCAR_URL`/`TRACCAR_USER`/`TRACCAR_PASSWORD` estão configurados (ver
 * `.env.example`) — nada a ligar manualmente além de configurar a VPS. Sem essas variáveis (ambiente de
 * desenvolvimento sem Traccar local, ou teste), fica inerte e loga uma vez.
 */
@Injectable()
export class PositionsPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PositionsPollerService.name);
  private timer?: NodeJS.Timeout;
  private consultando = false;

  constructor(
    private readonly client: TraccarClient,
    private readonly inbox: InboxRepository,
  ) {}

  onModuleInit(): void {
    if (process.env.TRACCAR_POLL_ENABLED === 'false') {
      // Forwarding (POST /ingest/traccar/*) ligado: o polling seria redundante (o dedup aguentaria, mas é
      // carga à toa no Traccar e no banco).
      this.logger.log('Polling do Traccar desligado por TRACCAR_POLL_ENABLED=false.');
      return;
    }
    const config = readTraccarConfig();
    if (!config) {
      this.logger.log('TRACCAR_URL não configurado — polling de posições desligado.');
      return;
    }

    const intervalMs = Number(process.env.TRACCAR_POLL_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.pollOnce(config, this.logger), intervalMs);
    this.logger.log(`Polling do Traccar ligado (${config.url}, a cada ${intervalMs}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Uma consulta por vez: com o Traccar lento, o `setInterval` empilharia consultas sobre a que ainda não voltou. */
  async pollOnce(config: ReturnType<typeof readTraccarConfig>, logger: Logger): Promise<void> {
    if (!config) return;
    if (this.consultando) {
      logger.warn('Polling do Traccar: consulta anterior ainda sem resposta — esta volta foi pulada');
      return;
    }
    this.consultando = true;
    try {
      // mesma fila do Forwarding e da conciliação (o dedup do worker descarta a posição que já chegou por outro caminho)
      const positions = await this.client.fetchPositions(config);
      for (const position of positions) await this.inbox.inserir('posicao', { position, origem: 'polling' });
    } catch (err) {
      logger.error(`Falha ao buscar posições do Traccar: ${(err as Error).message}`);
    } finally {
      this.consultando = false;
    }
  }
}
