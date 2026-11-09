import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActiveUserRepository } from './active-user.repository';
import { IS_PUBLIC_KEY } from './public.decorator';
import { verifyAuthToken, type Role } from './jwt';

export type RequestAuth =
  | { userId: string; clientId: string; role: Role; sessionStart: number }
  | { userId: string; clientId: null; role: 'superadmin'; sessionStart: number };

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

    // Token anterior à sessão persistente (sem `sessionStart`): usa o próprio `iat` como início da sessão.
    // Sem teto de dias (decisão do usuário): a sessão só termina por logout, troca de senha ou desativação,
    // conferidos abaixo — `sessionStart` só serve de proxy do `iat` para o recheck do SSE (realtime.controller.ts).
    const sessionStart = payload.sessionStart ?? payload.iat;
    if (sessionStart === undefined) throw new UnauthorizedException('Token inválido ou expirado');

    // Token válido de usuário desativado, ou com a senha trocada depois da emissão: o JWT não carrega esse
    // estado, então a checagem é no banco a cada requisição. Mesma mensagem genérica — não revela o motivo.
    const tokenIat = payload.iat!; // sempre presente: jsonwebtoken grava automaticamente ao assinar
    const ativo =
      payload.role === 'superadmin'
        ? await this.activeUsers.isSuperadmin(payload.sub, tokenIat)
        : await this.activeUsers.isActive(payload.sub, tokenIat);
    if (!ativo) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
    request.auth =
      payload.role === 'superadmin'
        ? { userId: payload.sub, clientId: null, role: 'superadmin' as const, sessionStart }
        : { userId: payload.sub, clientId: payload.clientId, role: payload.role, sessionStart };
    return true;
  }
}
