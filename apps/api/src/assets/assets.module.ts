import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AssetsController } from './assets.controller';
import { AssetsRepository } from './assets.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [AssetsController],
  providers: [AssetsRepository],
  exports: [AssetsRepository],
})
export class AssetsModule {}
