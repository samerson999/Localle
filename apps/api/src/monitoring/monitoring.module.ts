import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringRepository } from './monitoring.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [MonitoringController],
  providers: [MonitoringRepository],
})
export class MonitoringModule {}
