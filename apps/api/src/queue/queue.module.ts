import { Global, Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module';
import { PositionsQueue } from './positions.queue';
import { PositionsWorker } from './positions.worker';
import { redisConnectionProvider } from './redis.provider';

@Global()
@Module({
  imports: [IngestModule],
  providers: [redisConnectionProvider, PositionsQueue, PositionsWorker],
  exports: [redisConnectionProvider, PositionsQueue],
})
export class QueueModule {}
