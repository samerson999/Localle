import { Module } from '@nestjs/common';
import { AuditLogRepository } from './audit-log.repository';

@Module({
  providers: [AuditLogRepository],
  exports: [AuditLogRepository],
})
export class AuditModule {}
