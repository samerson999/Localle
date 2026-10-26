import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { MotoristasController } from './motoristas.controller';
import { MotoristasRepository } from './motoristas.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, SettingsModule],
  controllers: [MotoristasController],
  providers: [MotoristasRepository],
  exports: [MotoristasRepository],
})
export class MotoristasModule {}
