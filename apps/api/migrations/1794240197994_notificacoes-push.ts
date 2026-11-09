import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Fase 2 do plano de push (docs/PLANO-APK-TWA.md § 2): modelado por canal desde o início (webpush agora,
// Expo/FCM/APNs quando o nativo chegar) e sem Redis, mesmo padrão do `ingest_inbox` (fila no Postgres,
// lease + retry).
// - `notificacao_aparelhos`: uma assinatura de push por aparelho/navegador. `endpoint` é único porque o
//   próprio navegador garante isso; chaves do canal (`p256dh`/`auth`) nulas fora do webpush.
// - `notificacao_preferencias`: tipo de alerta ligado/desligado por usuário. Ausência de linha = padrão
//   (só prioridade alta), resolvido na aplicação, não aqui.
// - `notificacao_fila`: nasce na mesma transação do alerta (futuro `alertas.repository`); o worker resolve
//   destinatários (permissão de veículo + preferência) na hora de processar, não na hora de enfileirar —
//   por isso é uma linha por alerta, não por usuário.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.notificacao_aparelhos (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      user_id uuid not null references public.users(id) on delete cascade,
      canal text not null check (canal in ('webpush')),
      endpoint text not null unique,
      p256dh text,
      auth text,
      user_agent text,
      criado_em timestamptz not null default now(),
      ultimo_envio_em timestamptz,
      falhas integer not null default 0
    );
    create index on public.notificacao_aparelhos (client_id, user_id);

    create table public.notificacao_preferencias (
      client_id uuid not null references public.clients(id) on delete cascade,
      user_id uuid not null references public.users(id) on delete cascade,
      tipo text not null,
      ativo boolean not null default true,
      atualizado_em timestamptz not null default now(),
      primary key (user_id, tipo)
    );
    create index on public.notificacao_preferencias (client_id, user_id);

    create table public.notificacao_fila (
      id bigint generated always as identity primary key,
      client_id uuid not null references public.clients(id) on delete cascade,
      alerta_id uuid not null references public.alertas(id) on delete cascade,
      criado_em timestamptz not null default now(),
      processado_em timestamptz,
      tentativas integer not null default 0,
      lease_por text,
      lease_expira_em timestamptz,
      erro text,
      constraint notificacao_fila_alerta_id_key unique (alerta_id)
    );
    create index on public.notificacao_fila (processado_em, lease_expira_em) where processado_em is null;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.notificacao_fila;
    drop table public.notificacao_preferencias;
    drop table public.notificacao_aparelhos;
  `);
}
