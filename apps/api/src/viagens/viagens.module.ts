import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ViagensController } from './viagens.controller';
import { ViagensRepository } from './viagens.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [ViagensController],
  providers: [ViagensRepository],
})
export class ViagensModule {}
