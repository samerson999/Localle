import { Module } from '@nestjs/common';
import { InboxRepository } from './inbox.repository';
import { PositionsIngestService } from './positions-ingest.service';
import { ProcessadorPosicao } from './processador-posicao';

// Núcleo da ingestão, compartilhado pelas fontes (Forwarding/conciliação em IngestWebhookModule, polling em PollerModule):
// todas escrevem no inbox e o worker dele grava pelo ProcessadorPosicao. RealtimeHub vem do QueueModule (global).
@Module({
  providers: [PositionsIngestService, ProcessadorPosicao, InboxRepository],
  exports: [PositionsIngestService, ProcessadorPosicao, InboxRepository],
})
export class IngestModule {}
