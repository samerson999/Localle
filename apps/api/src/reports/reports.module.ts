import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';

@Module({
  imports: [AuthGuardsModule, SettingsModule, PermissionsModule],
  controllers: [ReportsController],
  providers: [ReportsRepository],
})
export class ReportsModule {}
