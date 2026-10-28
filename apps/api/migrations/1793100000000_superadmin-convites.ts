import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Equipe da Locale pelo painel (decisão de 28/10/2026): superadmin convida outro superadmin por e-mail, com o
// mesmo desenho do convite de usuário do cliente (`convites`): link de uso único, só o SHA-256 do token no
// banco, reenviar revoga o anterior. Quem convida nunca conhece a senha.
// - `superadmins.password_hash` passa a aceitar nulo: convidado que ainda não definiu a senha (o login já
//   falha para ele, comparando com hash fictício).
// - `superadmins.desativado_em`: tira o acesso sem apagar (auditoria aponta para o id). O AuthGuard passa a
//   recusar token já emitido de superadmin desativado.
// - `superadmin_convites`: sem `client_id` — superadmin está fora da hierarquia de clientes (como `superadmins`).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.superadmins alter column password_hash drop not null;
    alter table public.superadmins add column desativado_em timestamptz;

    create table public.superadmin_convites (
      id uuid primary key default gen_random_uuid(),
      superadmin_id uuid not null references public.superadmins(id) on delete cascade,
      token_hash text not null unique,
      expira_em timestamptz not null,
      usado_em timestamptz,
      revogado_em timestamptz,
      criado_por uuid not null,
      criado_em timestamptz not null default now()
    );
    create index on public.superadmin_convites (superadmin_id);
  `);
}

// down: convidados que ainda não definiram senha não cabem em `password_hash not null` — são removidos antes de
// restaurar a constraint (não há senha para preservar).
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.superadmin_convites;
    delete from public.superadmins where password_hash is null;
    alter table public.superadmins drop column desativado_em;
    alter table public.superadmins alter column password_hash set not null;
  `);
}
