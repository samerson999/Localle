import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { FrotaReportsController } from './frota-reports.controller';
import { FrotaReportsRepository } from './frota-reports.repository';
import { FrotaReportsService } from './frota-reports.service';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { RelatoriosGeradosController } from './relatorios-gerados.controller';
import { RelatoriosGeradosRepository } from './relatorios-gerados.repository';

@Module({
  imports: [AuthGuardsModule, SettingsModule, PermissionsModule],
  controllers: [ReportsController, FrotaReportsController, RelatoriosGeradosController],
  providers: [ReportsRepository, FrotaReportsRepository, FrotaReportsService, RelatoriosGeradosRepository],
})
export class ReportsModule {}
