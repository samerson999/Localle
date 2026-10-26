import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ChecklistController } from './checklist.controller';
import { ChecklistRepository } from './checklist.repository';

@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [ChecklistController],
  providers: [ChecklistRepository],
})
export class ChecklistModule {}
