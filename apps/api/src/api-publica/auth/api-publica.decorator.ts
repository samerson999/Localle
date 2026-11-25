import { applyDecorators, createParamDecorator, ExecutionContext, InternalServerErrorException, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiChaveGuard } from './api-chave.guard';
import type { Escopo } from './escopos';
import { API_PUBLICA_KEY, SO_MESTRA, type ApiAuth } from './metadata';

/**
 * Rota da API pública de consulta (docs/PLANO-API-PUBLICA.md § 3.3): autentica por chave de acesso, nunca por JWT.
 * O `AuthGuard` global deixa estas rotas para o `ApiChaveGuard`.
 */
export const ApiPublica = (escopo: Escopo) => applyDecorators(SetMetadata(API_PUBLICA_KEY, escopo), UseGuards(ApiChaveGuard));

/** Rota que só a chave mestra usa, sem cliente no caminho (nunca documentada no Swagger). */
export const ApiPublicaMestra = () => applyDecorators(SetMetadata(API_PUBLICA_KEY, SO_MESTRA), UseGuards(ApiChaveGuard));

/**
 * Cliente consultado: o da chave (chave de cliente) ou o do caminho (chave mestra), já conferido pelo guard. Mesmo
 * papel do `@ClientId()` nas rotas internas — 500 se usado fora de `@ApiPublica()`, que é bug de configuração.
 */
export const ClienteDaChave = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const auth: ApiAuth | undefined = ctx.switchToHttp().getRequest().apiAuth;
  if (!auth?.clientId) throw new InternalServerErrorException('@ClienteDaChave() usado numa rota sem @ApiPublica()');
  return auth.clientId;
});
