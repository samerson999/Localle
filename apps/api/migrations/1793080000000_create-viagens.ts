import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Viagens (hoje `trips`/`matrices` no navegador). Matriz: viagem recorrente com paradas (cerca + horário)
// por dia da semana e onde o veículo dorme. Viagem: externa (origem → carga → descarga → destino, cada
// etapa com sua cerca e carimbo) ou de pátio. Planejado × realizado da matriz (`compliance` em
// packages/shared/src/trips.ts) depende das visitas às cercas pela ingestão — fica para quando os eventos
// de cerca forem consolidados por viagem.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.viagem_matrizes (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null,
      asset_id uuid references public.assets(id) on delete set null,
      motorista_id uuid references public.motoristas(id) on delete set null,
      dias smallint[] not null default '{}',
      paradas jsonb not null default '[]',
      dorme jsonb not null default '{}',
      ativa boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index on public.viagem_matrizes (client_id);

    create table public.viagens (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      tipo text not null check (tipo in ('externo', 'patio')),
      nome text,
      asset_id uuid not null references public.assets(id) on delete cascade,
      motorista_id uuid references public.motoristas(id) on delete set null,
      matriz_id uuid references public.viagem_matrizes(id) on delete set null,
      origem_cerca_id uuid references public.cercas(id) on delete set null,
      carga_cerca_id uuid references public.cercas(id) on delete set null,
      descarga_cerca_id uuid references public.cercas(id) on delete set null,
      destino_cerca_id uuid references public.cercas(id) on delete set null,
      carga text,
      status text not null default 'aguardando' check (status in ('aguardando', 'em_andamento', 'concluida', 'cancelada')),
      iniciada_em timestamptz,
      carregada_em timestamptz,
      descarregada_em timestamptz,
      encerrada_em timestamptz,
      origem_inicio text,
      dados jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (status <> 'em_andamento' or iniciada_em is not null),
      check (status <> 'concluida' or encerrada_em is not null)
    );
    create index on public.viagens (client_id, status, created_at desc);
    create index on public.viagens (client_id, asset_id, iniciada_em desc);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.viagens;
    drop table public.viagem_matrizes;
  `);
}
