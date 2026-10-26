import { Module } from '@nestjs/common';
import { ComandosModule } from '../comandos/comandos.module';
import { EventsIngestService } from './events-ingest.service';
import { InboxRepository } from './inbox.repository';
import { InboxWorker } from './inbox.worker';
import { TraccarIngestController } from './traccar-ingest.controller';

// PositionsWorker e RealtimeHub vêm do QueueModule (global).
@Module({
  imports: [ComandosModule],
  controllers: [TraccarIngestController],
  providers: [InboxRepository, EventsIngestService, InboxWorker],
})
export class IngestWebhookModule {}
