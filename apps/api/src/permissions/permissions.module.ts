import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsController } from './permissions.controller';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsRepository } from './permissions.repository';
import { PermissionsService } from './permissions.service';
import { PerfisRepository } from './perfis.repository';
import { PerfisService } from './perfis.service';

@Module({
  imports: [AuthGuardsModule, AuditModule],
  controllers: [PermissionsController],
  providers: [PermissionsRepository, PermissionsService, PermissionsGuard, PerfisRepository, PerfisService],
  exports: [PermissionsService, PermissionsGuard, PerfisService],
})
export class PermissionsModule {}
