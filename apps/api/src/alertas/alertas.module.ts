import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AlertaTiposClienteController, AlertaTiposController, AlertaTiposService } from './alerta-tipos.controller';
import { AlertaTiposRepository } from './alerta-tipos.repository';
import { AlertasController } from './alertas.controller';
import { AlertasRepository } from './alertas.repository';
import { AlertasService } from './alertas.service';
import { SemPosicaoWorker } from './sem-posicao.worker';

// RealtimeHub vem do QueueModule (global). A criação de alertas pela ingestão usa `inserirAlerta`
// (função sobre a transação dela), não este módulo.
@Module({
  imports: [AuthGuardsModule, PermissionsModule, AuditModule],
  controllers: [AlertasController, AlertaTiposController, AlertaTiposClienteController],
  providers: [AlertasRepository, AlertasService, SemPosicaoWorker, AlertaTiposRepository, AlertaTiposService],
})
export class AlertasModule {}
