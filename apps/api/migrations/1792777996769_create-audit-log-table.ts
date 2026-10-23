import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Auditoria centralizada (requisito explícito: alteração de permissão e qualquer ação de superadmin
// sobre um cliente precisam ficar registradas). Uma tabela genérica — não uma por feature — porque as
// duas origens (mudança de permissão, ação de superadmin) são a mesma coisa do ponto de vista de
// auditoria: quem fez o quê, em qual cliente, quando, com o estado antes/depois.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.audit_log (
      id bigint generated always as identity primary key,
      actor_type text not null check (actor_type in ('user', 'superadmin')),
      actor_id uuid not null,
      client_id uuid references public.clients(id) on delete set null,
      action text not null,
      target text,
      before jsonb,
      after jsonb,
      created_at timestamptz not null default now()
    );
  `);
  pgm.createIndex('audit_log', ['client_id', 'created_at']);
  pgm.createIndex('audit_log', ['actor_type', 'actor_id']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('audit_log');
}
