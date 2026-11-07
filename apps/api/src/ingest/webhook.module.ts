import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { ComandosModule } from '../comandos/comandos.module';
import { ConciliacaoController } from './conciliacao.controller';
import { ConciliacaoRepository } from './conciliacao.repository';
import { ConciliacaoService } from './conciliacao.service';
import { EventsIngestService } from './events-ingest.service';
import { IngestModule } from './ingest.module';
import { InboxWorker } from './inbox.worker';
import { TraccarClient } from './traccar-client';
import { TraccarIngestController } from './traccar-ingest.controller';

// RealtimeHub vem do QueueModule (global); InboxRepository e ProcessadorPosicao do IngestModule. A conciliação mora aqui
// porque alimenta o mesmo inbox.
@Module({
  imports: [ComandosModule, AuthGuardsModule, IngestModule],
  controllers: [TraccarIngestController, ConciliacaoController],
  providers: [EventsIngestService, InboxWorker, ConciliacaoRepository, ConciliacaoService, TraccarClient],
})
export class IngestWebhookModule {}
