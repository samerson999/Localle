import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { FrotaReportsController } from './frota-reports.controller';
import { FrotaReportsRepository } from './frota-reports.repository';
import { FrotaReportsService } from './frota-reports.service';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';

@Module({
  imports: [AuthGuardsModule, SettingsModule, PermissionsModule],
  controllers: [ReportsController, FrotaReportsController],
  providers: [ReportsRepository, FrotaReportsRepository, FrotaReportsService],
})
export class ReportsModule {}
