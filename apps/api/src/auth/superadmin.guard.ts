import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestAuth } from './auth.guard';

/** Roda depois do `AuthGuard`. Só deixa passar token de superadmin — nunca token de usuário de cliente. */
@Injectable()
export class SuperadminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const auth: RequestAuth | undefined = request.auth;
    if (auth?.role !== 'superadmin') {
      throw new ForbiddenException('Rota exclusiva do superadmin');
    }
    return true;
  }
}
