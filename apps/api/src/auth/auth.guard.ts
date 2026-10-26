import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActiveUserRepository } from './active-user.repository';
import { IS_PUBLIC_KEY } from './public.decorator';
import { verifyAuthToken, type Role } from './jwt';

export type RequestAuth =
  | { userId: string; clientId: string; role: Role }
  | { userId: string; clientId: null; role: 'superadmin' };

export interface AuthenticatedRequest extends Request {
  auth?: RequestAuth;
}

/**
 * Registrado como guard global (`APP_GUARD`, `app.module.ts`) — achado #1 da auditoria de 23/10/2026:
 * autenticação é fail-closed por padrão, não opt-in por controller. Um endpoint novo sem `@Public()`
 * exige token automaticamente; antes disso, esquecer `@UseGuards(AuthGuard)` deixava a rota pública sem
 * nenhum aviso.
 *
 * Único jeito de uma requisição chegar com `client_id`/papel resolvidos (docs/ARQUITETURA-BACKEND.md § 8,
 * item 5) — lê e valida o Bearer token, nunca aceita isso vindo de header/corpo/query. O token é assinado
 * (`JWT_SECRET`), então `clientId`/`role` não são manipuláveis pelo cliente da API sem invalidar a
 * assinatura. Token de superadmin não tem `clientId` (ele está fora da hierarquia de clientes — ver
 * `src/superadmin/`); qualquer ação dele sobre um cliente precisa de `client_id` explícito no path da
 * rota, nunca deste `request.auth`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly activeUsers: ActiveUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers['authorization'];
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Token ausente');

    let payload: ReturnType<typeof verifyAuthToken>;
    try {
      payload = verifyAuthToken(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
    // Token válido de usuário desativado (ou apagado) depois da emissão: o JWT não carrega esse estado,
    // então a checagem é no banco. Mesma mensagem genérica — não revela o motivo.
    const ativo =
      payload.role === 'superadmin'
        ? await this.activeUsers.isSuperadmin(payload.sub)
        : await this.activeUsers.isActive(payload.sub);
    if (!ativo) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
    request.auth =
      payload.role === 'superadmin'
        ? { userId: payload.sub, clientId: null, role: 'superadmin' as const }
        : { userId: payload.sub, clientId: payload.clientId, role: payload.role };
    return true;
  }
}
