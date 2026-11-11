import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Alerta "rastreador sem enviar posição" (11/11/2026): um por queda, que sobe de nível (4 h, 12 h, 24 h).
// A queda é identificada pelo ativo + a hora da última posição válida (`ts`). O índice único garante um alerta
// por queda mesmo com mais de uma instância da API rodando a rotina ao mesmo tempo (`on conflict do nothing`).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`create unique index alertas_sem_posicao_queda_uniq on public.alertas (asset_id, ts) where tipo = 'sem_posicao';`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop index public.alertas_sem_posicao_queda_uniq;');
}
