import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { MailModule } from '../mail/mail.module';
import { ConvitesController } from './convites.controller';
import { ConvitesService } from './convites.service';

@Module({
  imports: [AuthGuardsModule, MailModule, AuditModule],
  controllers: [ConvitesController],
  providers: [ConvitesService],
  exports: [ConvitesService],
})
export class ConvitesModule {}
