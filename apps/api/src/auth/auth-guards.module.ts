import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { SuperadminGuard } from './superadmin.guard';

/**
 * Achado #7 da auditoria de 23/10/2026: `AuthModule` (login) precisa de `UsersModule`, e `UsersModule`
 * precisa dos guards para proteger o próprio controller — isso fechava um ciclo de 3 módulos
 * (Auth → Users → Permissions → Auth), resolvido até aqui com `forwardRef` nos três pontos.
 *
 * Os guards (`AuthGuard`, `SuperadminGuard`) não têm nenhuma dependência de `UsersModule`/login — só
 * precisavam estar "dentro" de `AuthModule" por convenção de arquivo. Separando-os num módulo próprio,
 * sem imports, quem só precisa do guard (`ClientsModule`, `AssetsModule`, `PermissionsModule`,
 * `UsersModule`, etc.) importa só isto, nunca `AuthModule` inteiro — quebra o ciclo de vez, sem
 * `forwardRef` em lugar nenhum do grafo de módulos.
 */
@Module({
  providers: [AuthGuard, SuperadminGuard],
  exports: [AuthGuard, SuperadminGuard],
})
export class AuthGuardsModule {}
