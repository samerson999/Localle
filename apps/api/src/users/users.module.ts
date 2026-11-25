import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { MailModule } from '../mail/mail.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { EmailContaController } from './email-conta.controller';
import { EmailContaService } from './email-conta.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

// Achado #7 da auditoria de 23/10/2026: AuthModule (login) importava UsersModule, e UsersModule
// importava AuthModule de volta só pelos guards — ciclo resolvido trocando a dependência por
// AuthGuardsModule (sem import nenhum), não por forwardRef.
@Module({
  imports: [AuthGuardsModule, AuditModule, PermissionsModule, MailModule],
  controllers: [UsersController, EmailContaController],
  providers: [UsersRepository, UsersService, EmailContaService],
  exports: [UsersRepository],
})
export class UsersModule {}
