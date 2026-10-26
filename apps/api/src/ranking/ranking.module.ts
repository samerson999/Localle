import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { JornadaModule } from '../jornada/jornada.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SettingsModule } from '../settings/settings.module';
import { RankingController } from './ranking.controller';
import { RankingRepository } from './ranking.repository';
import { RankingService } from './ranking.service';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, SettingsModule, JornadaModule],
  controllers: [RankingController],
  providers: [RankingRepository, RankingService],
})
export class RankingModule {}
