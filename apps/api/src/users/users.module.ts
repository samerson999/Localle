import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { ClientsModule } from '../clients/clients.module';
import { ConvitesModule } from '../convites/convites.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

// Achado #7 da auditoria de 23/10/2026: AuthModule (login) importava UsersModule, e UsersModule
// importava AuthModule de volta só pelos guards — ciclo resolvido trocando a dependência por
// AuthGuardsModule (sem import nenhum), não por forwardRef.
@Module({
  imports: [AuthGuardsModule, AuditModule, PermissionsModule, ClientsModule, ConvitesModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersRepository],
})
export class UsersModule {}
