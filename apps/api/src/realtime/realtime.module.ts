import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { ComunicacaoTicker } from './comunicacao-ticker.service';
import { RealtimeController } from './realtime.controller';
import { RealtimeStreamService } from './realtime-stream.service';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, MonitoringModule, SettingsModule],
  controllers: [RealtimeController],
  providers: [RealtimeStreamService, ComunicacaoTicker],
})
export class RealtimeModule {}
