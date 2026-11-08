import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// O que o cadastro guardava só no navegador de quem editou (varredura de 07/11/2026): a ficha do ativo
// (tipo, marca/modelo, ficha técnica, campos, documentos, medidor, metas de combustível…), as operações
// (contrato/tipo de operação, com meta de consumo própria) e os dados do empregador do espelho de ponto.
// - `assets.dados`: mesmo desenho de `motoristas.dados` — o formato é do front; a API só limita tamanho.
// - `operacoes`: entidade de verdade porque o ativo aponta para ela (`assets.operacao_id`) e a meta de
//   consumo da operação entra na hierarquia veículo → operação → grupo → empresa.
// - `clients.empresa`: razão social, CNPJ e endereço do empregador (cabeçalho do espelho de ponto).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.operacoes (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null,
      meta_kml numeric(6,2) check (meta_kml is null or meta_kml > 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint operacoes_client_id_nome_key unique (client_id, nome)
    );

    alter table public.assets
      add column dados jsonb not null default '{}',
      add column operacao_id uuid references public.operacoes(id) on delete set null;
    create index on public.assets (operacao_id) where operacao_id is not null;

    alter table public.clients add column empresa jsonb not null default '{}';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.clients drop column empresa;
    alter table public.assets drop column operacao_id, drop column dados;
    drop table public.operacoes;
  `);
}
