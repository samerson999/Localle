import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuardsModule } from './auth-guards.module';
import { AuthService } from './auth.service';
import { SenhaSuperadminRepository } from './senha-superadmin.repository';
import { SenhaRepository } from './senha.repository';
import { SenhaService } from './senha.service';

@Module({
  imports: [UsersModule, AuthGuardsModule, MailModule, AuditModule, PermissionsModule],
  controllers: [AuthController],
  providers: [AuthService, SenhaRepository, SenhaSuperadminRepository, SenhaService],
})
export class AuthModule {}
