import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Aviso de backup sem comunicar (14/11/2026, continuação de 1794360000000): rotina da plataforma, prioridade baixa e sem
// subir de nível — o ativo continua rastreado pelo principal; o aviso só existe para a tag/backup sem bateria ou
// arrancado não passar despercebido. Um alerta por queda: índice único por (ativo, último pacote), como o sem_posicao.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    insert into public.alerta_tipos (chave, nome, prioridade, exige_tratamento, gera_alerta, sistema, disparo, notifica_push)
    values ('backup_sem_sinal', 'Backup sem comunicar', 'baixa', false, true, true, 'sistema', false)
    on conflict (chave) do nothing;
    create unique index alertas_backup_sem_sinal_queda_uniq on public.alertas (asset_id, ts) where tipo = 'backup_sem_sinal';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop index public.alertas_backup_sem_sinal_queda_uniq;
    delete from public.alerta_tipos where chave = 'backup_sem_sinal';
  `);
}
