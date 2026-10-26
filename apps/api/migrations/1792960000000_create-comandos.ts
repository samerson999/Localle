import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.6: comando enviado a um rastreador pela API do Traccar, com
// estados auditáveis. Além dos estados da especificação, `cancelado`: comando ainda pendente que foi
// substituído por um oposto mais recente (engineStop → engineResume) — regra de precedência da § 4.6
// ("o comando mais recente intencional vence"). `expirado`/`cancelado` descrevem só o que o backend
// decidiu, nunca o estado do aparelho; um `commandResult` que chegue depois fica em `resultado`
// (`tardio: true`), nunca é silenciado.
//
// `comandos_pendente_uidx`: um comando igual pendente bloqueia outro, no banco (condição de corrida entre
// duas requisições simultâneas), como a especificação pede.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.comandos (
      id uuid primary key default gen_random_uuid(),
      rastreador_id uuid not null references public.rastreadores(id),
      client_id uuid not null references public.clients(id) on delete cascade,
      asset_id uuid not null references public.assets(id) on delete cascade,
      tipo text not null,
      solicitado_por uuid not null references public.users(id),
      motivo text,
      status text not null default 'solicitado'
        check (status in ('solicitado','enviado','aguardando','confirmado','falhou','expirado','cancelado')),
      traccar_command_id bigint,
      solicitado_em timestamptz not null default now(),
      enviado_em timestamptz,
      resolvido_em timestamptz,
      expira_em timestamptz not null,
      resultado jsonb,
      constraint comandos_prazo check (expira_em > solicitado_em)
    );
  `);
  pgm.sql(`create index on public.comandos (client_id, solicitado_em desc);`);
  pgm.sql(`create index on public.comandos (rastreador_id, status) where status in ('solicitado','enviado','aguardando');`);
  pgm.sql(`create unique index comandos_pendente_uidx on public.comandos (rastreador_id, tipo)
    where status in ('solicitado','enviado','aguardando');`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('comandos');
}
