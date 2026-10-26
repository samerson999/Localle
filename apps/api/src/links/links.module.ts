import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { LinksController, LinksPublicoController } from './links.controller';
import { LinksRepository } from './links.repository';
import { LinksService } from './links.service';

@Module({
  imports: [AuthGuardsModule, PermissionsModule],
  controllers: [LinksController, LinksPublicoController],
  providers: [LinksRepository, LinksService],
})
export class LinksModule {}
