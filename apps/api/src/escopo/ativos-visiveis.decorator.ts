import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Veículos que o usuário vê (`null` = a frota toda) — para o módulo que não carrega `assetId` na resposta. */
export const AtivosVisiveis = createParamDecorator((_: unknown, ctx: ExecutionContext): ReadonlySet<string> | null => {
  const auth = ctx.switchToHttp().getRequest().auth;
  return auth && 'ativos' in auth ? auth.ativos : null;
});
