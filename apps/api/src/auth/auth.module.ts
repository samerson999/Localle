import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuardsModule } from './auth-guards.module';
import { AuthService } from './auth.service';

@Module({
  imports: [UsersModule, AuthGuardsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
