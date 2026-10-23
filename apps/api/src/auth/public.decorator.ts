import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public';

/**
 * Marca uma rota como isenta do `AuthGuard` global (achado #1 da auditoria de 23/10/2026: autenticação
 * passa a ser fail-closed por padrão — todo endpoint novo exige token a menos que declare `@Public()`
 * explicitamente). Hoje só 3 rotas usam isso: health check e os dois logins.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
