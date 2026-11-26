import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Relatório de motoristas (26/11/2026): entra no histórico de relatórios exportados.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.relatorios_gerados drop constraint relatorios_gerados_tipo_check;
    alter table public.relatorios_gerados add constraint relatorios_gerados_tipo_check
      check (tipo in ('cercas', 'velocidade', 'posicoes', 'passou_por_aqui', 'uso', 'motoristas'));
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    delete from public.relatorios_gerados where tipo = 'motoristas';
    alter table public.relatorios_gerados drop constraint relatorios_gerados_tipo_check;
    alter table public.relatorios_gerados add constraint relatorios_gerados_tipo_check
      check (tipo in ('cercas', 'velocidade', 'posicoes', 'passou_por_aqui', 'uso'));
  `);
}
