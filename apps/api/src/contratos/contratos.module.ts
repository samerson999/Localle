import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { ClientsModule } from '../clients/clients.module';
import { ContratosController } from './contratos.controller';
import { ContratosRepository } from './contratos.repository';
import { ContratosService } from './contratos.service';
import { FaturamentoService } from './faturamento.service';
import { FaturasRepository } from './faturas.repository';

@Module({
  imports: [AuthGuardsModule, ClientsModule, AuditModule],
  controllers: [ContratosController],
  providers: [ContratosRepository, ContratosService, FaturasRepository, FaturamentoService],
  exports: [ContratosRepository, FaturasRepository, FaturamentoService],
})
export class ContratosModule {}
