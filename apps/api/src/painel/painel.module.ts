import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { ContratosModule } from '../contratos/contratos.module';
import { TraccarClient } from '../ingest/traccar-client';
import { MailModule } from '../mail/mail.module';
import { QueueModule } from '../queue/queue.module';
import { PainelController } from './painel.controller';
import { PainelRepository } from './painel.repository';
import { PainelService } from './painel.service';

@Module({
  imports: [AuthGuardsModule, ContratosModule, QueueModule, MailModule],
  controllers: [PainelController],
  providers: [PainelRepository, PainelService, TraccarClient],
})
export class PainelModule {}
