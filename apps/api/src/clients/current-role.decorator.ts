import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import type { Role } from '../auth/jwt';

/** Igual a `@ClientId()`, mas para o papel do usuário autenticado (`admin`/`gestor`/`operador`). */
export const CurrentRole = createParamDecorator((_: unknown, ctx: ExecutionContext): Role => {
  const request = ctx.switchToHttp().getRequest();
  const role = request.auth?.role;
  if (!role || role === 'superadmin') {
    throw new InternalServerErrorException('@CurrentRole() usado numa rota sem AuthGuard de usuário de cliente');
  }
  return role;
});

/** Id do próprio usuário autenticado — para auditoria (`updated_by`) e proteção contra autoescalonamento. */
export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const userId = request.auth?.userId;
  if (!userId) {
    throw new InternalServerErrorException('@CurrentUserId() usado numa rota sem AuthGuard');
  }
  return userId;
});
