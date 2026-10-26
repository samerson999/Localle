import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AlertasController } from './alertas.controller';
import { AlertasRepository } from './alertas.repository';
import { AlertasService } from './alertas.service';

// RealtimeHub vem do QueueModule (global). A criação de alertas pela ingestão usa `inserirAlerta`
// (função sobre a transação dela), não este módulo.
@Module({
  imports: [AuthGuardsModule, PermissionsModule, AuditModule],
  controllers: [AlertasController],
  providers: [AlertasRepository, AlertasService],
})
export class AlertasModule {}
