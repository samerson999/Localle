import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type IORedis from 'ioredis';
import type { RealtimeMessage } from '@localle/shared/realtime';
import { REDIS_CONNECTION } from '../queue/redis.provider';

type Listener = (message: RealtimeMessage) => void;

interface ChannelEntry {
  listeners: Set<Listener>;
  /** Resolve quando o Redis confirmou o SUBSCRIBE — só a partir daí nenhuma publicação se perde. */
  ready: Promise<unknown>;
}

export function realtimeChannel(clientId: string): string {
  return `rt:cliente:${clientId}`;
}

/**
 * Pub/sub Redis do tempo real (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.2): uma assinatura por tenant e
 * por instância da API, compartilhada por todas as conexões abertas daquele cliente nesta instância — não
 * uma por conexão. A conexão de assinatura é dedicada (`duplicate()`): uma conexão Redis em modo
 * subscriber não aceita outros comandos, e a principal é usada pelo BullMQ e pelo `publish`.
 */
@Injectable()
export class RealtimeHub implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeHub.name);
  private subscriber?: IORedis;
  private readonly channels = new Map<string, ChannelEntry>();

  constructor(@Inject(REDIS_CONNECTION) private readonly redis: IORedis) {}

  async publish(clientId: string, message: RealtimeMessage): Promise<void> {
    await this.redis.publish(realtimeChannel(clientId), JSON.stringify(message));
  }

  /** Devolve a função que cancela a assinatura deste listener. */
  async subscribe(clientId: string, listener: Listener): Promise<() => Promise<void>> {
    const channel = realtimeChannel(clientId);
    const subscriber = this.getSubscriber();
    let entry = this.channels.get(channel);
    if (!entry) {
      entry = { listeners: new Set(), ready: subscriber.subscribe(channel) };
      this.channels.set(channel, entry);
    }
    entry.listeners.add(listener);
    await entry.ready;

    const current = entry;
    return async () => {
      current.listeners.delete(listener);
      if (current.listeners.size === 0 && this.channels.get(channel) === current) {
        this.channels.delete(channel);
        await subscriber.unsubscribe(channel);
      }
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.subscriber?.disconnect();
  }

  private getSubscriber(): IORedis {
    if (this.subscriber) return this.subscriber;
    const subscriber = this.redis.duplicate();
    subscriber.on('message', (channel: string, raw: string) => {
      const entry = this.channels.get(channel);
      if (!entry) return;
      let message: RealtimeMessage;
      try {
        message = JSON.parse(raw) as RealtimeMessage;
      } catch (err) {
        this.logger.warn(`Mensagem de tempo real ilegível descartada no canal ${channel}: ${(err as Error).message}`);
        return;
      }
      for (const listener of entry.listeners) listener(message);
    });
    subscriber.on('error', (err) => this.logger.error(`Conexão de assinatura do tempo real: ${err.message}`));
    this.subscriber = subscriber;
    return subscriber;
  }
}
