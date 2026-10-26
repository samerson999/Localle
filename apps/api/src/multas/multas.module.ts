import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { MultasController } from './multas.controller';
import { MultasRepository } from './multas.repository';
import { MultasService } from './multas.service';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, SettingsModule],
  controllers: [MultasController],
  providers: [MultasRepository, MultasService],
})
export class MultasModule {}
