import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Link temporário de localização (Monitoramento › Compartilhar): quem abre vê só a posição atual de um
// veículo, sem login, até o prazo. O token é entregue uma única vez na criação; aqui fica só o hash
// (sha256) — quem lê o banco não consegue abrir os links. Cada abertura é registrada (PRODUCT.md, "Link de
// localização: registra cada abertura (quantas e quando)").
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.links_localizacao (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      asset_id uuid not null references public.assets(id) on delete cascade,
      token_hash text not null unique,
      destinatario text,
      criado_por uuid references public.users(id) on delete set null,
      criado_em timestamptz not null default now(),
      expira_em timestamptz not null,
      revogado_em timestamptz,
      constraint links_localizacao_prazo check (expira_em > criado_em)
    );
  `);
  pgm.sql('create index on public.links_localizacao (client_id, asset_id);');

  pgm.sql(`
    create table public.link_aberturas (
      id bigint generated always as identity primary key,
      link_id uuid not null references public.links_localizacao(id) on delete cascade,
      aberto_em timestamptz not null default now()
    );
  `);
  pgm.sql('create index on public.link_aberturas (link_id);');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('link_aberturas');
  pgm.dropTable('links_localizacao');
}
