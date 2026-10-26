import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RealtimeController } from './realtime.controller';
import { RealtimeStreamService } from './realtime-stream.service';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, MonitoringModule],
  controllers: [RealtimeController],
  providers: [RealtimeStreamService],
})
export class RealtimeModule {}
