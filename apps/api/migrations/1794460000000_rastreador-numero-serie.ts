import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Número de série do rastreador (23/11/2026, pedido do Rafael): em alguns aparelhos (JMAK e outros) o que vem impresso
// na etiqueta é o número de série, não o IMEI. Opcional — nos aparelhos em que os dois são iguais fica vazio. Único entre
// os não desativados, como o IMEI (recadastro depois de desativar continua livre).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.rastreadores add column numero_serie text;
    create unique index rastreadores_numero_serie_ativo_uidx on public.rastreadores (numero_serie)
      where status <> 'desativado' and numero_serie is not null;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop index public.rastreadores_numero_serie_ativo_uidx;
    alter table public.rastreadores drop column numero_serie;
  `);
}
