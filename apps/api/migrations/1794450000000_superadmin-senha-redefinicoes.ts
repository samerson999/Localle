import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// "Esqueci minha senha" também para a equipe da Localle (22/11/2026): mesmo código de 6 dígitos por e-mail de
// `senha_redefinicoes`, em tabela própria — superadmin fica fora da hierarquia de clientes (como
// `superadmin_convites`). Só o HMAC do código fica no banco; `tentativas` segura a força bruta (src/auth/codigo.ts).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.superadmin_senha_redefinicoes (
      id uuid primary key default gen_random_uuid(),
      superadmin_id uuid not null references public.superadmins(id) on delete cascade,
      token_hash text not null,
      expira_em timestamptz not null,
      usado_em timestamptz,
      revogado_em timestamptz,
      tentativas int not null default 0,
      criado_em timestamptz not null default now()
    );
    create index on public.superadmin_senha_redefinicoes (superadmin_id, criado_em);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop table public.superadmin_senha_redefinicoes;');
}
