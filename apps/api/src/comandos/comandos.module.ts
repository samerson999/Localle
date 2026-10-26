import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { TraccarClient } from '../ingest/traccar-client';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { ComandosController } from './comandos.controller';
import { ComandosRepository } from './comandos.repository';
import { ComandosService } from './comandos.service';

// RealtimeHub vem do QueueModule (global). Exporta o service para o worker do inbox entregar `commandResult`.
@Module({
  imports: [AuthGuardsModule, PermissionsModule, SettingsModule, AuditModule],
  controllers: [ComandosController],
  providers: [ComandosRepository, ComandosService, TraccarClient],
  exports: [ComandosService],
})
export class ComandosModule {}
