import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Conciliação com o Traccar (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.6 e § 6a; decisão de 05/11/2026): o retry do
// Forwarding fica na memória do Traccar e tem teto — num teste com 2 min de API fora, 95 de 120 posições nunca chegaram.
// A conciliação busca no Traccar (REST, por rastreador e janela de fixTime) o que não está em `ingest_posicoes_recebidas`
// nem pendente no inbox, e põe no `ingest_inbox` com prioridade baixa.
// - `ingest_conciliacao_checkpoints`: até onde (fixTime) cada rastreador já foi conferido. Avança na MESMA transação que
//   insere as posições faltantes no inbox — nunca antes de elas estarem gravadas.
// - `ingest_conciliacao_execucoes`: contagens de cada volta (automática ou reexecução manual), para a tela/diagnóstico.
// - `ingest_inbox.prioridade`: 0 = tempo real (Forwarding), 1 = recuperada. ADD COLUMN com default constante não
//   reescreve a tabela (Postgres 11+).
// - Índice de expressão só nas linhas pendentes de posição: a conciliação pergunta "este id do Traccar já está no inbox
//   esperando?" por rastreador; sem ele, cada pergunta varreria o backlog inteiro.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.ingest_conciliacao_checkpoints (
      rastreador_id uuid primary key references public.rastreadores(id) on delete cascade,
      conciliado_ate timestamptz not null,
      atualizado_em timestamptz not null default now()
    );

    create table public.ingest_conciliacao_execucoes (
      id bigint generated always as identity primary key,
      modo text not null check (modo in ('automatica', 'manual')),
      iniciada_em timestamptz not null default now(),
      concluida_em timestamptz,
      parametros jsonb not null default '{}'::jsonb,
      rastreadores integer not null default 0,
      consultas_traccar integer not null default 0,
      verificadas integer not null default 0,
      ja_recebidas integer not null default 0,
      ja_no_inbox integer not null default 0,
      recuperadas integer not null default 0,
      rejeitadas integer not null default 0,
      falhas integer not null default 0,
      interrompida_por text
    );
    create index on public.ingest_conciliacao_execucoes (iniciada_em desc);

    alter table public.ingest_inbox add column prioridade smallint not null default 0 check (prioridade in (0, 1));

    create index ingest_inbox_posicao_pendente_idx on public.ingest_inbox
      (((payload->'position'->>'deviceId')::bigint), ((payload->'position'->>'id')::bigint))
      where processado_em is null and tipo = 'posicao';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop index public.ingest_inbox_posicao_pendente_idx;
    alter table public.ingest_inbox drop column prioridade;
    drop table public.ingest_conciliacao_execucoes;
    drop table public.ingest_conciliacao_checkpoints;
  `);
}
