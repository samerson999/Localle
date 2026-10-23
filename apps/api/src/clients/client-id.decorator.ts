import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';

/**
 * Lê o `client_id` que o `AuthGuard` (src/auth/auth.guard.ts) já validou e anexou à requisição — nunca
 * de header/corpo/query. Um controller que usa `@ClientId()` precisa estar atrás de `@UseGuards(AuthGuard)`;
 * se não estiver, isso é bug de configuração da rota, não entrada do usuário (daí o 500, não 400/401).
 */
export const ClientId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const clientId = request.auth?.clientId;
  if (!clientId) {
    throw new InternalServerErrorException('@ClientId() usado numa rota sem AuthGuard');
  }
  return clientId;
});
