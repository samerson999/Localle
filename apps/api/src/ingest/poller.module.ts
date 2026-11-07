import { Module } from '@nestjs/common';
import { IngestModule } from './ingest.module';
import { PositionsPollerService } from './positions-poller.service';
import { TraccarClient } from './traccar-client';

@Module({
  imports: [IngestModule],
  providers: [TraccarClient, PositionsPollerService],
})
export class PollerModule {}
