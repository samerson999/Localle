import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { REDIS_CONNECTION } from './redis.provider';
import type { TraccarPositionPayload } from '../ingest/traccar-position.mapper';

/**
 * Sobrescrevível por ambiente para o teste da fila usar uma fila só dele — sem isso, qualquer outro worker
 * ligado ao mesmo Redis (ex.: a API do infra/dev) consome os jobs do teste.
 */
export function positionsQueueName(): string {
  return process.env.POSITIONS_QUEUE_NAME || 'positions-ingest';
}

/**
 * Fila entre a ingestão (poller do Traccar) e a gravação (worker → PositionsIngestService) —
 * docs/ARQUITETURA-BACKEND.md § 4: amortece rajada de reconexão e não perde posição se o Postgres
 * estiver momentaneamente indisponível (BullMQ reprocessa o job).
 */
@Injectable()
export class PositionsQueue {
  readonly queue: Queue<TraccarPositionPayload>;

  constructor(@Inject(REDIS_CONNECTION) connection: IORedis) {
    this.queue = new Queue<TraccarPositionPayload>(positionsQueueName(), { connection });
  }

  async enqueue(position: TraccarPositionPayload): Promise<void> {
    await this.queue.add('position', position, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
