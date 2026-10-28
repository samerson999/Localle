import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { TraccarClient } from '../ingest/traccar-client';
import { InstalacoesRepository } from './instalacoes.repository';
import { RastreadoresClienteController } from './rastreadores-cliente.controller';
import { RastreadoresController } from './rastreadores.controller';
import { RastreadorVinculosRepository } from './rastreador-vinculos.repository';
import { RastreadoresRepository } from './rastreadores.repository';
import { RastreadoresService } from './rastreadores.service';
import { RastreadorModelosController } from './rastreador-modelos.controller';
import { RastreadorModelosRepository } from './rastreador-modelos.repository';
import { RastreadorModelosService } from './rastreador-modelos.service';
import { SimCardsRepository } from './sim-cards.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule, AssetsModule, AuditModule],
  controllers: [RastreadoresController, RastreadoresClienteController, RastreadorModelosController],
  providers: [RastreadoresRepository, SimCardsRepository, InstalacoesRepository, RastreadorVinculosRepository, RastreadoresService, RastreadorModelosRepository, RastreadorModelosService, TraccarClient],
})
export class RastreadoresModule {}
