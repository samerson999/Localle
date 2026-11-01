import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Confirmação de comando pelo estado real (decisão de 01/11/2026). Até aqui qualquer `commandResult` virava
// `confirmado`, inclusive uma resposta de recusa. Agora:
// - `recusado` (final): o texto da resposta indica falha (comandos.service.ts, RESPOSTA_DE_FALHA).
// - `respondido` (ainda pendente): bloqueio/desbloqueio de modelo que informa o estado de bloqueio — o aparelho
//   respondeu, mas só vira `confirmado` quando o atributo de bloqueio mudar para o esperado; sem isso no prazo, expira.
// `respondido` conta como pendente: entra no índice único e no índice de pendentes do rastreador.
const PENDENTES_ANTES = "'solicitado','enviado','aguardando'";
const PENDENTES = "'solicitado','enviado','aguardando','respondido'";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.comandos drop constraint comandos_status_check,
      add constraint comandos_status_check
        check (status in ('solicitado','enviado','aguardando','respondido','confirmado','recusado','falhou','expirado','cancelado'));
    drop index public.comandos_pendente_uidx;
    create unique index comandos_pendente_uidx on public.comandos (rastreador_id, tipo) where status in (${PENDENTES});
    drop index public.comandos_rastreador_id_status_idx;
    create index comandos_rastreador_id_status_idx on public.comandos (rastreador_id, status) where status in (${PENDENTES});
  `);
}

// Volta ao conjunto antigo: `respondido` vira `enviado` (ainda esperando) e `recusado` vira `falhou`.
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    update public.comandos set status = 'enviado' where status = 'respondido';
    update public.comandos set status = 'falhou' where status = 'recusado';
    alter table public.comandos drop constraint comandos_status_check,
      add constraint comandos_status_check
        check (status in ('solicitado','enviado','aguardando','confirmado','falhou','expirado','cancelado'));
    drop index public.comandos_pendente_uidx;
    create unique index comandos_pendente_uidx on public.comandos (rastreador_id, tipo) where status in (${PENDENTES_ANTES});
    drop index public.comandos_rastreador_id_status_idx;
    create index comandos_rastreador_id_status_idx on public.comandos (rastreador_id, status) where status in (${PENDENTES_ANTES});
  `);
}
