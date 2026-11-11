import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { CatalogoAtivosController } from './catalogo-ativos.controller';
import { CatalogoAtivosRepository } from './catalogo-ativos.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [CatalogoAtivosController],
  providers: [CatalogoAtivosRepository],
})
export class CatalogoAtivosModule {}
