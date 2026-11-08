import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { OperacoesController } from './operacoes.controller';
import { OperacoesRepository } from './operacoes.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [OperacoesController],
  providers: [OperacoesRepository],
})
export class OperacoesModule {}
