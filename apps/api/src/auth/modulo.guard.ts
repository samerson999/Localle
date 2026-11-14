import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActiveUserRepository } from './active-user.repository';
import type { RequestAuth } from './auth.guard';

const MODULO_KEY = 'localle:modulo';

/**
 * Roda depois do `AuthGuard` (global). Recusa a rota de um módulo que não está no contrato do cliente do token —
 * sem isso, desligar o módulo só escondia o menu e a API continuava respondendo. Cliente sem contrato acessa tudo.
 * Superadmin passa: não tem `client_id` e as rotas de módulo já não servem a ele.
 */
@Injectable()
export class ModuloGuard implements CanActivate {
  private readonly logger = new Logger(ModuloGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly activeUsers: ActiveUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const modulo = this.reflector.getAllAndOverride<string | undefined>(MODULO_KEY, [context.getHandler(), context.getClass()]);
    const auth: RequestAuth | undefined = context.switchToHttp().getRequest().auth;
    if (!modulo || !auth?.clientId) return true;
    const { modules } = await this.activeUsers.acessosDoCliente(auth.clientId);
    if (modules === null || modules.includes(modulo)) return true;
    this.logger.warn(`módulo fora do contrato client_id=${auth.clientId} user_id=${auth.userId} modulo=${modulo}`);
    throw new ForbiddenException('Este módulo não está contratado');
  }
}

/** Controller de um módulo contratável (chave de `MODULES`, `@localle/shared/contratos`). */
export const Modulo = (key: string) => applyDecorators(SetMetadata(MODULO_KEY, key), UseGuards(ModuloGuard));
