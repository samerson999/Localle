import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Perfis de acesso do cliente (20/11/2026): além de Gestor e Operador, o admin cria perfis próprios (ex.: Portaria,
// Financeiro) e marca o que cada um pode. Cada perfil herda de um papel-base (`base_role`), que continua sendo o
// `users.role` de quem está nele — o padrão de uma permissão nova no catálogo vem desse papel. Permissão do perfil
// é tabela própria, como `role_permission_overrides` (autorização fora de `client_settings`).
// FKs compostas por (client_id, id): um usuário nunca aponta para perfil de outro cliente, nem por bug de aplicação.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.perfis (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null check (length(btrim(nome)) between 1 and 60),
      descricao text check (descricao is null or length(descricao) <= 200),
      base_role text not null check (base_role in ('gestor', 'operador')),
      criado_por uuid references public.users(id) on delete set null,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      unique (client_id, id)
    );
    create unique index perfis_client_nome_uniq on public.perfis (client_id, lower(btrim(nome)));

    create table public.perfil_permissoes (
      client_id uuid not null,
      perfil_id uuid not null,
      permission_key text not null,
      allowed boolean not null,
      updated_by uuid references public.users(id) on delete set null,
      updated_at timestamptz not null default now(),
      primary key (perfil_id, permission_key),
      foreign key (client_id, perfil_id) references public.perfis(client_id, id) on delete cascade
    );
    create index perfil_permissoes_client_idx on public.perfil_permissoes (client_id);

    alter table public.users add column perfil_id uuid;
    alter table public.users add constraint users_perfil_fk
      foreign key (client_id, perfil_id) references public.perfis(client_id, id);
    create index users_perfil_idx on public.users (perfil_id) where perfil_id is not null;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.users drop constraint users_perfil_fk;
    alter table public.users drop column perfil_id;
    drop table public.perfil_permissoes;
    drop table public.perfis;
  `);
}
