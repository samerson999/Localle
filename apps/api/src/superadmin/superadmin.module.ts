import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { ClientsModule } from '../clients/clients.module';
import { UsersModule } from '../users/users.module';
import { SuperadminAuthService } from './superadmin-auth.service';
import { SuperadminClientsService } from './superadmin-clients.service';
import { SuperadminController } from './superadmin.controller';
import { SuperadminRepository } from './superadmin.repository';

@Module({
  imports: [AuthGuardsModule, ClientsModule, UsersModule, AuditModule],
  controllers: [SuperadminController],
  providers: [SuperadminRepository, SuperadminAuthService, SuperadminClientsService],
})
export class SuperadminModule {}
