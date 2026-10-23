import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.3. SQL cru (não os helpers do node-pg-migrate) porque a PK
// composta com `id` `generated always as identity` e o `create_hypertable` do TimescaleDB não mapeiam
// bem para a API de `createTable` — mais seguro copiar o schema já revisado literalmente.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.ingest_posicoes_recebidas (
      rastreador_id uuid not null references public.rastreadores(id),
      traccar_position_id bigint not null,
      posicao_id bigint,
      recebido_em timestamptz not null default now(),
      primary key (rastreador_id, traccar_position_id)
    );
  `);
  pgm.sql(`
    create index on public.ingest_posicoes_recebidas (recebido_em) where posicao_id is null;
  `);

  pgm.sql(`
    create table public.posicoes (
      id bigint generated always as identity,
      rastreador_id uuid not null references public.rastreadores(id),
      traccar_position_id bigint not null,
      client_id uuid,
      asset_id uuid,
      fix_time timestamptz not null,
      server_time timestamptz not null,
      received_at timestamptz not null default now(),
      valid boolean not null,
      geom geometry(Point, 4326) not null,
      speed_kmh numeric,
      course numeric,
      altitude numeric,
      odometer_m numeric,
      ignition boolean,
      attributes jsonb not null default '{}',
      primary key (rastreador_id, fix_time, id)
    );
  `);
  pgm.sql(`select create_hypertable('posicoes', 'fix_time', chunk_time_interval => interval '1 day');`);
  pgm.sql(`create index on public.posicoes (rastreador_id, fix_time desc);`);
  pgm.sql(`create index on public.posicoes using gist (geom);`);
  pgm.sql(`create index on public.posicoes (client_id, fix_time desc) where client_id is not null;`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop table public.posicoes;');
  pgm.sql('drop table public.ingest_posicoes_recebidas;');
}
