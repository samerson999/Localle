import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { CercasController } from './cercas.controller';
import { CercasRepository } from './cercas.repository';

// A detecção de entrada/saída (cerca-detector.ts) não passa por aqui: roda dentro da transação da
// ingestão de posições, como função sobre o PoolClient dela.
@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [CercasController],
  providers: [CercasRepository],
  exports: [CercasRepository],
})
export class CercasModule {}
