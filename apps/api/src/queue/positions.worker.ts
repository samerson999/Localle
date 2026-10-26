import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type IORedis from 'ioredis';
import { PositionsIngestService, type IngestResult } from '../ingest/positions-ingest.service';
import { mapTraccarPosition, type NormalizedPosition, type TraccarPositionPayload } from '../ingest/traccar-position.mapper';
import { RealtimeHub } from '../realtime/realtime.hub';
import { REDIS_CONNECTION } from './redis.provider';
import { positionsQueueName } from './positions.queue';

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
    private readonly realtime: RealtimeHub,
  ) {}

  onModuleInit(): void {
    if (process.env.POSITIONS_WORKER_ENABLED === 'false') return;

    this.worker = new Worker<TraccarPositionPayload>(
      positionsQueueName(),
      (job: Job<TraccarPositionPayload>) => this.process(job),
      { connection: this.connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} falhou após tentativas: ${err.message}`);
    });
  }

  async process(job: Pick<Job<TraccarPositionPayload>, 'id' | 'data'>): Promise<IngestResult> {
    const position = mapTraccarPosition(job.data);
    const result = await this.ingest.ingest(position);
    if (result.status === 'rastreador_desconhecido') {
      this.logger.warn(`Posição descartada: traccar_device_id ${job.data.deviceId} não cadastrado`);
    }
    if (result.status === 'gravada') await this.publicar(result, position, job.id);
    return result;
  }

  /**
   * Depois do commit: a posição já está no banco, então falha aqui não pode falhar o job — o reprocesso
   * cairia no dedup e não republicaria nada. O front se recupera pelo snapshot/`since` na reconexão
   * (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.2), por isso é warn e não error.
   */
  private async publicar(
    result: Extract<IngestResult, { status: 'gravada' }>,
    position: NormalizedPosition,
    jobId: string | undefined,
  ) {
    if (!result.clientId) return;
    try {
      if (result.atualizouUltimaPosicao && result.assetId) {
        await this.realtime.publish(result.clientId, {
          kind: 'posicao',
          assetId: result.assetId,
          rastreadorId: result.rastreadorId,
          fixTime: position.fixTime.toISOString(),
          lat: position.latitude,
          lon: position.longitude,
          speedKmh: position.speedKmh,
          ignition: position.ignition,
        });
      }
      for (const e of result.eventos) {
        await this.realtime.publish(result.clientId, {
          kind: 'evento',
          id: String(e.id),
          assetId: result.assetId,
          tipo: e.tipo,
          ts: e.ts.toISOString(),
          attributes: e.attributes,
        });
      }
      for (const alerta of result.alertas) {
        await this.realtime.publish(result.clientId, { kind: 'alerta', alerta });
      }
    } catch (err) {
      this.logger.warn(
        `Tempo real não publicado (job ${jobId}, posicao_id ${result.posicaoId}, client_id ${result.clientId}): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
