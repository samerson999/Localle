import { Global, Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module';
import { PositionsQueue } from './positions.queue';
import { PositionsWorker } from './positions.worker';
import { RealtimeHub } from '../realtime/realtime.hub';
import { redisConnectionProvider } from './redis.provider';

// RealtimeHub mora aqui (e não num módulo próprio) porque depende da mesma conexão Redis e é usado pelo
// worker desta fila — um módulo à parte criaria import circular com o provider de Redis global.
@Global()
@Module({
  imports: [IngestModule],
  providers: [redisConnectionProvider, PositionsQueue, PositionsWorker, RealtimeHub],
  exports: [redisConnectionProvider, PositionsQueue, PositionsWorker, RealtimeHub],
})
export class QueueModule {}
