import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Decisão de 23/10/2026 (papéis dentro do cliente): admin (era "gestor" único) substitui o antigo papel
// único por três — admin, gestor, operador — ver src/permissions/permission-definitions.ts para o que
// cada um pode por padrão. O Superadmin (Locale) é uma tabela separada (`superadmins`, próxima
// migração), não um papel desta tabela — ele não pertence a `client_id` nenhum.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`alter table public.users drop constraint users_role_check`);
  pgm.sql(`alter table public.users add constraint users_role_check check (role in ('admin', 'gestor', 'operador'))`);
  // usuários existentes (seed de desenvolvimento) viram admin do próprio cliente — é o papel mais
  // próximo do que "gestor único" significava antes desta migração.
  pgm.sql(`update public.users set role = 'admin' where role = 'gestor'`);
  pgm.alterColumn('users', 'role', { default: 'operador' });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`update public.users set role = 'gestor' where role in ('admin', 'operador')`);
  pgm.alterColumn('users', 'role', { default: 'gestor' });
  pgm.sql(`alter table public.users drop constraint users_role_check`);
  pgm.sql(`alter table public.users add constraint users_role_check check (role in ('gestor'))`);
}
