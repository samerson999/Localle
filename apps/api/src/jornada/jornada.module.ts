import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { JornadaController } from './jornada.controller';
import { JornadaRepository } from './jornada.repository';
import { JornadaService } from './jornada.service';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, SettingsModule],
  controllers: [JornadaController],
  providers: [JornadaRepository, JornadaService],
  exports: [JornadaRepository, JornadaService],
})
export class JornadaModule {}
