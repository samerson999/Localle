import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { EmpresaController } from './empresa.controller';
import { EmpresaRepository } from './empresa.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [EmpresaController],
  providers: [EmpresaRepository],
})
export class EmpresaModule {}
