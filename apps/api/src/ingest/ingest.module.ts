import { Module } from '@nestjs/common';
import { PositionsIngestService } from './positions-ingest.service';

@Module({
  providers: [PositionsIngestService],
  exports: [PositionsIngestService],
})
export class IngestModule {}
