import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { ClientsController } from './clients.controller';
import { ClientsRepository } from './clients.repository';

@Module({
  imports: [AuthGuardsModule],
  controllers: [ClientsController],
  providers: [ClientsRepository],
  exports: [ClientsRepository],
})
export class ClientsModule {}
