import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { PositionsPollerService } from './positions-poller.service';
import { TraccarClient } from './traccar-client';

@Module({
  imports: [QueueModule],
  providers: [TraccarClient, PositionsPollerService],
})
export class PollerModule {}
