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

/**
 * Início da sessão do token atual (unix seconds) — usado onde uma conexão de longa duração (SSE) precisa
 * reconferir periodicamente se a senha não foi trocada depois (realtime.controller.ts), sem reabrir a
 * conexão a cada checagem. `sessionStart` nunca é mais recente que o `iat` real do token (preservado nas
 * renovações, nunca reiniciado) — então usá-lo no lugar do `iat` exato é sempre igual ou mais rígido:
 * pode, no máximo, encerrar a conexão um pouco mais cedo do que o estritamente necessário, nunca aceitar
 * como válida uma sessão que a checagem com o `iat` exato já teria recusado.
 */
export const CurrentSessionStart = createParamDecorator((_: unknown, ctx: ExecutionContext): number => {
  const request = ctx.switchToHttp().getRequest();
  const sessionStart = request.auth?.sessionStart;
  if (sessionStart === undefined) {
    throw new InternalServerErrorException('@CurrentSessionStart() usado numa rota sem AuthGuard');
  }
  return sessionStart;
});
