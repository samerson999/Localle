import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { InstalacoesRepository } from './instalacoes.repository';
import { RastreadoresController } from './rastreadores.controller';
import { RastreadoresRepository } from './rastreadores.repository';
import { RastreadoresService } from './rastreadores.service';
import { SimCardsRepository } from './sim-cards.repository';

@Module({
  imports: [AuthGuardsModule, AssetsModule, AuditModule],
  controllers: [RastreadoresController],
  providers: [RastreadoresRepository, SimCardsRepository, InstalacoesRepository, RastreadoresService],
})
export class RastreadoresModule {}
