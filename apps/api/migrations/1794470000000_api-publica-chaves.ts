import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// API pública de consulta (docs/PLANO-API-PUBLICA.md § 3, 23/11/2026). Só o SHA-256 da chave fica no banco (a chave tem
// 256 bits de entropia, não é senha — sem salt); `prefixo` é o começo da chave para a tela reconhecer qual é qual.
// Revogação é lógica (`revogada_em`), nunca delete: o histórico de quem emitiu continua consultável.
//
// - `api_chaves`: chave de um cliente (`client_id` obrigatório, isolamento pelo BaseRepository).
// - `api_chaves_mestras`: chave da equipe da Localle, sem `client_id` (o cliente vem do caminho da rota) — lista de IPs
//   e validade obrigatórias (§ 3.6).
// - `api_chaves_mestras_acessos`: cada consulta feita com chave mestra (cliente, rota, IP). Só o Console lê; o cliente
//   não vê (decisão 23/11).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.api_chaves (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null check (length(nome) between 1 and 80),
      prefixo text not null,
      hash bytea not null unique,
      escopos text[] not null check (cardinality(escopos) > 0),
      criada_por uuid references public.users(id) on delete set null,
      criada_em timestamptz not null default now(),
      expira_em timestamptz,
      revogada_em timestamptz,
      ultimo_uso_em timestamptz
    );
    create index on public.api_chaves (client_id) where revogada_em is null;

    create table public.api_chaves_mestras (
      id uuid primary key default gen_random_uuid(),
      nome text not null check (length(nome) between 1 and 80),
      prefixo text not null,
      hash bytea not null unique,
      ips_permitidos cidr[] not null check (cardinality(ips_permitidos) > 0),
      criada_por uuid references public.superadmins(id) on delete set null,
      criada_em timestamptz not null default now(),
      expira_em timestamptz not null,
      revogada_em timestamptz,
      ultimo_uso_em timestamptz,
      check (expira_em <= criada_em + interval '90 days')
    );

    create table public.api_chaves_mestras_acessos (
      id bigint generated always as identity primary key,
      chave_id uuid not null references public.api_chaves_mestras(id) on delete cascade,
      client_id uuid references public.clients(id) on delete set null,
      rota text not null,
      ip inet,
      status int not null,
      criado_em timestamptz not null default now()
    );
    create index on public.api_chaves_mestras_acessos (chave_id, criado_em desc);
    create index on public.api_chaves_mestras_acessos (client_id, criado_em desc);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.api_chaves_mestras_acessos;
    drop table public.api_chaves_mestras;
    drop table public.api_chaves;
  `);
}
