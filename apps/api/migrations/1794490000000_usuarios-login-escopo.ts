import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Equipe do cliente sem convite por e-mail (25/11/2026): o admin cria o acesso com nome de usuário + senha, ativa,
// desativa e exclui, e escolhe quais veículos a pessoa vê.
// - `username`: login sem e-mail. Único no sistema inteiro (o login ainda não sabe o cliente). O e-mail passa a ser
//   opcional: quem nasceu por usuário informa o próprio e-mail no primeiro acesso (`email_confirmacoes`), confirmado
//   por código, para poder recuperar a senha.
// - `excluido_em`: exclusão sem apagar — comandos, alertas tratados e auditoria seguem apontando para a pessoa. O
//   e-mail e o usuário de quem foi excluído ficam livres (os únicos passam a valer só entre os não excluídos).
// - Escopo de veículos: `escopo_restrito = false` vê a frota toda (padrão, e sempre para o admin). Restrito vê o
//   veículo que está num grupo marcado, OU numa operação marcada, OU — com `escopo_sem_grupo` — o que não está em
//   grupo nenhum nem tem operação.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.users
      add column username text,
      add column excluido_em timestamptz,
      add column escopo_restrito boolean not null default false,
      add column escopo_sem_grupo boolean not null default false,
      alter column email drop not null,
      add constraint users_login_check check (email is not null or username is not null),
      add constraint users_username_formato check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,39}$');

    alter table public.users drop constraint users_email_key;
    create unique index users_email_key on public.users (email) where excluido_em is null;
    create unique index users_username_key on public.users (username) where excluido_em is null;

    alter table public.asset_groups add constraint asset_groups_id_client_uniq unique (id, client_id);
    alter table public.operacoes add constraint operacoes_id_client_uniq unique (id, client_id);

    create table public.user_escopo_grupos (
      user_id uuid not null,
      client_id uuid not null,
      group_id uuid not null,
      primary key (user_id, group_id),
      foreign key (user_id, client_id) references public.users(id, client_id) on delete cascade,
      foreign key (group_id, client_id) references public.asset_groups(id, client_id) on delete cascade
    );
    create table public.user_escopo_operacoes (
      user_id uuid not null,
      client_id uuid not null,
      operacao_id uuid not null,
      primary key (user_id, operacao_id),
      foreign key (user_id, client_id) references public.users(id, client_id) on delete cascade,
      foreign key (operacao_id, client_id) references public.operacoes(id, client_id) on delete cascade
    );

    create table public.email_confirmacoes (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      client_id uuid not null,
      email text not null,
      token_hash text not null,
      tentativas int not null default 0,
      criado_em timestamptz not null default now(),
      expira_em timestamptz not null,
      usado_em timestamptz,
      revogado_em timestamptz,
      foreign key (user_id, client_id) references public.users(id, client_id) on delete cascade
    );
    create index on public.email_confirmacoes (user_id, criado_em desc);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.email_confirmacoes;
    drop table public.user_escopo_operacoes;
    drop table public.user_escopo_grupos;
    alter table public.operacoes drop constraint operacoes_id_client_uniq;
    alter table public.asset_groups drop constraint asset_groups_id_client_uniq;
    drop index public.users_username_key;
    drop index public.users_email_key;
    delete from public.users where email is null or excluido_em is not null;
    alter table public.users
      drop constraint users_username_formato,
      drop constraint users_login_check,
      alter column email set not null,
      drop column escopo_sem_grupo,
      drop column escopo_restrito,
      drop column excluido_em,
      drop column username;
    alter table public.users add constraint users_email_key unique (email);
  `);
}
