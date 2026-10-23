import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsController } from './permissions.controller';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsRepository } from './permissions.repository';
import { PermissionsService } from './permissions.service';

@Module({
  imports: [AuthGuardsModule, AuditModule],
  controllers: [PermissionsController],
  providers: [PermissionsRepository, PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
