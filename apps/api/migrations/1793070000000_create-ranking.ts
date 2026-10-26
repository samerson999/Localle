import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Ranking de motoristas (hoje `rankCfg`/`events` no navegador). A matriz padrão é `EVENT_TYPES` de
// packages/shared/src/catalog.ts (código); `ranking_matriz` guarda só o que o cliente alterou ou criou
// (peso, faixas, ativo, tipos próprios da empresa). `ranking_eventos` são os eventos de condução
// atribuídos a um motorista — vindos do rastreador/CAN pela ingestão (quando houver atribuição) ou
// lançados pelo gestor; violações de jornada entram no cálculo direto das marcações, não aqui.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.ranking_matriz (
      client_id uuid not null references public.clients(id) on delete cascade,
      codigo text not null,
      label text,
      categoria text,
      peso numeric(6, 2) check (peso is null or peso >= 0),
      faixas jsonb,
      ativo boolean not null default true,
      custom boolean not null default false,
      updated_at timestamptz not null default now(),
      primary key (client_id, codigo)
    );

    create table public.ranking_eventos (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      motorista_id uuid not null references public.motoristas(id) on delete cascade,
      asset_id uuid references public.assets(id) on delete set null,
      ts timestamptz not null,
      tipo text not null,
      valor numeric(12, 2),
      origem text not null default 'manual' check (origem in ('rastreador', 'can', 'manual', 'regra')),
      evento_id bigint,
      created_at timestamptz not null default now()
    );
    create index on public.ranking_eventos (client_id, ts desc);
    create index on public.ranking_eventos (client_id, motorista_id, ts desc);
    create unique index ranking_eventos_evento_uidx on public.ranking_eventos (client_id, evento_id) where evento_id is not null;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.ranking_eventos;
    drop table public.ranking_matriz;
  `);
}
