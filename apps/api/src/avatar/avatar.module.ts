import { Module } from '@nestjs/common';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { AvatarController } from './avatar.controller';
import { AvatarRepository } from './avatar.repository';

@Module({
  imports: [AuthGuardsModule],
  controllers: [AvatarController],
  providers: [AvatarRepository],
})
export class AvatarModule {}
