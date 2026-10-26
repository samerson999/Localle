import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringRepository } from './monitoring.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, SettingsModule],
  controllers: [MonitoringController],
  providers: [MonitoringRepository],
  exports: [MonitoringRepository],
})
export class MonitoringModule {}
