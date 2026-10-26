import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { ManutencaoController } from './manutencao.controller';
import { ManutencaoRepository } from './manutencao.repository';
import { ManutencaoService } from './manutencao.service';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, SettingsModule],
  controllers: [ManutencaoController],
  providers: [ManutencaoRepository, ManutencaoService],
})
export class ManutencaoModule {}
