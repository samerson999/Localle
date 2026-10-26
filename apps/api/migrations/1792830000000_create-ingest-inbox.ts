import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.1: inbox transacional do Forwarding do Traccar. O endpoint
// só responde 202 depois do commit aqui (mesmo banco com backup/PITR), não depois de empilhar no Redis.
// Processamento por lease (reivindica em transação curta, processa fora dela, confirma em outra) — ver o
// protocolo na doc. Tabela relacional comum (não hypertable): a limpeza é um delete periódico do worker.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.ingest_inbox (
      id bigint generated always as identity primary key,
      tipo text not null check (tipo in ('posicao', 'evento')),
      payload jsonb not null,
      recebido_em timestamptz not null default now(),
      tentativas integer not null default 0,
      lease_por text,
      lease_expira_em timestamptz,
      processado_em timestamptz,
      erro text
    );
  `);
  pgm.sql('create index on public.ingest_inbox (recebido_em) where processado_em is null;');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('ingest_inbox');
}
