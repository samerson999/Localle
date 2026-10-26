import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Alertas do monitoramento ("Precisa de você", sino, tela de Alertas). Nascem no backend, na mesma
// transação do evento que os originou (alarme do aparelho, cerca, regra) — nunca no navegador. Lido e
// tratamento são do cliente (compartilhados entre os usuários dele), com quem tratou e por quê.
// `evento_id` é referência lógica a eventos.id (hypertable: sem FK, mesmo motivo de eventos.posicao_id).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.alertas (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      asset_id uuid references public.assets(id) on delete set null,
      evento_id bigint,
      origem text not null check (origem in ('aparelho', 'cerca', 'regra')),
      tipo text not null,
      titulo text not null,
      detalhe text,
      prioridade text not null check (prioridade in ('alta', 'media', 'baixa')),
      ts timestamptz not null,
      lido_em timestamptz,
      tratado_em timestamptz,
      tratado_por uuid references public.users(id) on delete set null,
      tratamento_motivo text,
      tratamento_obs text,
      criado_em timestamptz not null default now(),
      constraint alertas_tratamento_completo check (tratado_em is null or tratamento_motivo is not null)
    );
  `);
  pgm.sql('create index on public.alertas (client_id, ts desc);');
  pgm.sql('create index on public.alertas (client_id) where tratado_em is null;');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('alertas');
}
