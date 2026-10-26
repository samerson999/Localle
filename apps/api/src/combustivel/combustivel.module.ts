import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { AbastecimentosRepository } from './abastecimentos.repository';
import { CombustivelController } from './combustivel.controller';
import { CombustivelService } from './combustivel.service';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, SettingsModule],
  controllers: [CombustivelController],
  providers: [AbastecimentosRepository, CombustivelService],
  exports: [AbastecimentosRepository],
})
export class CombustivelModule {}
