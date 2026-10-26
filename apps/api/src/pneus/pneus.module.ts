import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { PneusController } from './pneus.controller';
import { PneusRepository } from './pneus.repository';
import { PneusService } from './pneus.service';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, SettingsModule],
  controllers: [PneusController],
  providers: [PneusRepository, PneusService],
})
export class PneusModule {}
