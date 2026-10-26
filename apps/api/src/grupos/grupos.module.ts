import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { GruposController } from './grupos.controller';
import { GruposRepository } from './grupos.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [GruposController],
  providers: [GruposRepository],
  exports: [GruposRepository],
})
export class GruposModule {}
