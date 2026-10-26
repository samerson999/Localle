import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Redefinição de senha ("esqueci minha senha"), mesmo desenho dos convites: só o SHA-256 do token fica no
// banco, uso único (`usado_em`), validade curta, e pedir de novo revoga os anteriores (`revogado_em`).
// Tabela própria (não `convites`): convite confirma e-mail e cria a primeira senha; aqui o usuário já
// existe com senha — misturar os dois faria a consulta do convite aceitar um token de reset e vice-versa.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.senha_redefinicoes (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.users(id) on delete cascade,
      client_id uuid not null references public.clients(id) on delete cascade,
      token_hash text not null unique,
      expira_em timestamptz not null,
      usado_em timestamptz,
      revogado_em timestamptz,
      criado_em timestamptz not null default now()
    );
    create index on public.senha_redefinicoes (user_id, criado_em desc);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('senha_redefinicoes');
}
