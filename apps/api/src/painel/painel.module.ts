import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { ContratosModule } from '../contratos/contratos.module';
import { TraccarClient } from '../ingest/traccar-client';
import { MailModule } from '../mail/mail.module';
import { QueueModule } from '../queue/queue.module';
import { DespesasController, DespesasService } from './despesas.controller';
import { DespesasRepository } from './despesas.repository';
import { PainelController } from './painel.controller';
import { PainelRepository } from './painel.repository';
import { PainelService } from './painel.service';

@Module({
  imports: [AuthGuardsModule, AuditModule, ContratosModule, QueueModule, MailModule],
  controllers: [PainelController, DespesasController],
  providers: [PainelRepository, PainelService, TraccarClient, DespesasRepository, DespesasService],
})
export class PainelModule {}
