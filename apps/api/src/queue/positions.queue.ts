import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { REDIS_CONNECTION } from './redis.provider';
import type { TraccarPositionPayload } from '../ingest/traccar-position.mapper';

export const POSITIONS_QUEUE_NAME = 'positions-ingest';

/**
 * Fila entre a ingestão (poller do Traccar) e a gravação (worker → PositionsIngestService) —
 * docs/ARQUITETURA-BACKEND.md § 4: amortece rajada de reconexão e não perde posição se o Postgres
 * estiver momentaneamente indisponível (BullMQ reprocessa o job).
 */
@Injectable()
export class PositionsQueue {
  readonly queue: Queue<TraccarPositionPayload>;

  constructor(@Inject(REDIS_CONNECTION) connection: IORedis) {
    this.queue = new Queue<TraccarPositionPayload>(POSITIONS_QUEUE_NAME, { connection });
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
