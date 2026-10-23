import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.5. Sem FK para `posicoes` de propósito: `posicoes.id` não é
// chave única fora da PK composta da hypertable, e o TimescaleDB não aceita FK entre hypertables — a
// referência (`posicao_id`) é lógica, resolvida pelo worker, nunca garantida pelo banco.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.ingest_eventos_recebidos (
      rastreador_id uuid not null references public.rastreadores(id),
      traccar_event_id bigint not null,
      evento_id bigint,
      recebido_em timestamptz not null default now(),
      primary key (rastreador_id, traccar_event_id)
    );
  `);

  pgm.sql(`
    create table public.eventos (
      id bigint generated always as identity,
      rastreador_id uuid not null references public.rastreadores(id),
      client_id uuid,
      asset_id uuid,
      origem text not null check (origem in ('aparelho', 'regra')),
      tipo text not null,
      ts timestamptz not null,
      traccar_event_id bigint,
      posicao_id bigint,
      attributes jsonb not null default '{}',
      primary key (rastreador_id, ts, id)
    );
  `);
  pgm.sql(`select create_hypertable('eventos', 'ts', chunk_time_interval => interval '7 days');`);
  pgm.sql(`create index on public.eventos (client_id, ts desc);`);
  pgm.sql(`create index on public.eventos (rastreador_id, tipo, ts desc);`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop table public.eventos;');
  pgm.sql('drop table public.ingest_eventos_recebidos;');
}
