import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Primeiro acesso por convite (decidido em 24/10/2026): a Locale informa só o e-mail do admin do cliente; o
// sistema manda um link de uso único e o próprio admin define a senha — isso confirma o e-mail e ninguém da
// Locale conhece a senha.
//
// - `users.password_hash` passa a aceitar nulo: usuário convidado ainda sem senha. O login já falha para ele
//   (compara com hash fictício), sem caminho especial.
// - `users.email_confirmado_em`: quando o e-mail foi provado (aceite do convite). Usuários anteriores a esta
//   migration recebem `created_at` — foram criados com senha definida por quem os cadastrou.
// - `convites`: só o SHA-256 do token fica no banco (o token em si só existe no e-mail). Uso único
//   (`usado_em`) e expiração; reenviar invalida os anteriores do mesmo usuário (`revogado_em`).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.users alter column password_hash drop not null;
    alter table public.users add column email_confirmado_em timestamptz;
    update public.users set email_confirmado_em = created_at where password_hash is not null;

    create table public.convites (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.users(id) on delete cascade,
      client_id uuid not null references public.clients(id) on delete cascade,
      token_hash text not null unique,
      expira_em timestamptz not null,
      usado_em timestamptz,
      revogado_em timestamptz,
      criado_por uuid not null,
      criado_em timestamptz not null default now()
    );
    create index on public.convites (user_id);
  `);
}

// down: usuários convidados que ainda não definiram senha não cabem em `password_hash not null` — são
// removidos antes de restaurar a constraint (não há senha para preservar).
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.convites;
    delete from public.users where password_hash is null;
    alter table public.users drop column email_confirmado_em;
    alter table public.users alter column password_hash set not null;
  `);
}
