import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// API pública (24/11/2026): as chaves dos clientes passam a ser geradas pela equipe da Localle no Console, não mais pelo
// admin do cliente no Setup. `criada_por` (users) fica para as que já existiam; as novas registram o superadmin.
// `resetada_em`: o reset troca o valor (hash) da mesma chave, e a tela mostra quando foi o último.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.api_chaves
      add column criada_por_superadmin uuid references public.superadmins(id) on delete set null,
      add column resetada_em timestamptz;
    alter table public.api_chaves_mestras add column resetada_em timestamptz;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.api_chaves_mestras drop column resetada_em;
    alter table public.api_chaves drop column criada_por_superadmin, drop column resetada_em;
  `);
}
