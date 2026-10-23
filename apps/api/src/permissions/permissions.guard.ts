import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestAuth } from '../auth/auth.guard';
import { PERMISSION_KEY } from './require-permission.decorator';
import { PermissionsService } from './permissions.service';

/**
 * Roda depois do `AuthGuard` (precisa de `request.auth` já preenchido). Verifica a permissão declarada
 * por `@RequirePermission(key)` no handler; sem o decorator, deixa passar (autorização é opt-in por
 * rota, autenticação pelo `AuthGuard` continua obrigatória).
 *
 * Correção de 23/10/2026 (observação do pentest): superadmin **não** recebe autorização implícita numa
 * rota de cliente só por ser superadmin — ele está fora da hierarquia de clientes de propósito (sem
 * `client_id`), e uma rota com `@RequirePermission` é, por definição, escopada a um cliente. Rejeita
 * explicitamente com 403 (nunca deixava vazar dado antes disso — `@ClientId()` já barrava com 500 — mas
 * 500 é o comportamento errado para uma decisão de autorização; 403 é explícito e correto). Operação de
 * superadmin sobre um cliente específico usa sempre um endpoint próprio de `src/superadmin/`, com
 * `client_id` explícito no path, nunca uma rota de cliente "emprestada" via bypass de papel.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!key) return true;

    const request = context.switchToHttp().getRequest();
    const auth: RequestAuth | undefined = request.auth;
    if (!auth) throw new ForbiddenException('Requisição sem autenticação resolvida');
    if (auth.role === 'superadmin') {
      throw new ForbiddenException(
        'Superadmin não tem autorização implícita em rotas de cliente — use um endpoint de superadmin com client_id explícito',
      );
    }

    const allowed = await this.permissions.isAllowed(auth.clientId, auth.role, key);
    if (!allowed) {
      throw new ForbiddenException(`Seu papel ("${auth.role}") não tem a permissão "${key}"`);
    }
    return true;
  }
}
