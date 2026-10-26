import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RegrasController } from './regras.controller';
import { RegrasRepository } from './regras.repository';

// A avaliação (motor-regras.ts) roda dentro da transação da ingestão de posições, não por aqui.
@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [RegrasController],
  providers: [RegrasRepository],
})
export class RegrasModule {}
