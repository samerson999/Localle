import { Global, Module } from '@nestjs/common';
import { RealtimeHub } from '../realtime/realtime.hub';
import { redisConnectionProvider } from './redis.provider';

// Conexão Redis + RealtimeHub (pub/sub do tempo real), globais. O nome QueueModule é histórico: até 05/11/2026 a fila
// BullMQ do polling morava aqui; com o `ingest_inbox` como fila única de posições, o Redis ficou só para o tempo real.
@Global()
@Module({
  providers: [redisConnectionProvider, RealtimeHub],
  exports: [redisConnectionProvider, RealtimeHub],
})
export class QueueModule {}
