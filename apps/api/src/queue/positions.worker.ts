import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type IORedis from 'ioredis';
import { PositionsIngestService } from '../ingest/positions-ingest.service';
import { mapTraccarPosition, type TraccarPositionPayload } from '../ingest/traccar-position.mapper';
import { REDIS_CONNECTION } from './redis.provider';
import { POSITIONS_QUEUE_NAME } from './positions.queue';

/**
 * Consumidor da fila: cada job é uma posição crua do Traccar. Mapeia e delega a persistência real para
 * `PositionsIngestService` (a mesma lógica, com ou sem fila — a fila só entra como buffer antes dela).
 */
@Injectable()
export class PositionsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PositionsWorker.name);
  private worker?: Worker<TraccarPositionPayload>;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: IORedis,
    private readonly ingest: PositionsIngestService,
  ) {}

  onModuleInit(): void {
    if (process.env.POSITIONS_WORKER_ENABLED === 'false') return;

    this.worker = new Worker<TraccarPositionPayload>(
      POSITIONS_QUEUE_NAME,
      async (job: Job<TraccarPositionPayload>) => {
        const result = await this.ingest.ingest(mapTraccarPosition(job.data));
        if (result.status === 'rastreador_desconhecido') {
          this.logger.warn(`Posição descartada: traccar_device_id ${job.data.deviceId} não cadastrado`);
        }
        return result;
      },
      { connection: this.connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} falhou após tentativas: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
