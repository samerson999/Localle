import { Module } from '@nestjs/common';
import { EventsIngestService } from './events-ingest.service';
import { InboxRepository } from './inbox.repository';
import { InboxWorker } from './inbox.worker';
import { TraccarIngestController } from './traccar-ingest.controller';

// PositionsWorker e RealtimeHub vêm do QueueModule (global).
@Module({
  controllers: [TraccarIngestController],
  providers: [InboxRepository, EventsIngestService, InboxWorker],
})
export class IngestWebhookModule {}
