import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificacaoFilaRepository } from './notificacao-fila.repository';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacaoAparelhosRepository, NotificacaoPreferenciasRepository } from './notificacoes.repository';
import { NotificacoesWorker } from './notificacoes.worker';

@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [NotificacoesController],
  providers: [NotificacaoAparelhosRepository, NotificacaoPreferenciasRepository, NotificacaoFilaRepository, NotificacoesWorker],
  exports: [NotificacaoAparelhosRepository, NotificacaoPreferenciasRepository],
})
export class NotificacoesModule {}
