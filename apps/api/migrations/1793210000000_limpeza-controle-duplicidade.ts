import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Limpeza do controle de duplicidade da ingestão (decisão de 05/11/2026): `ingest_posicoes_recebidas` ganha uma linha por
// posição e nada apagava — na HML tinha o mesmo número de linhas de `posicoes` (60.912), e com 2.000 placas seriam
// ~335 GB/ano sem compressão. O dedup só precisa cobrir a janela em que a mesma posição pode chegar de novo (retry do
// Forwarding, conciliação), então o worker do inbox apaga o que tem mais de INGEST_DEDUP_DIAS (padrão 14) em lotes.
// Índice por `recebido_em` para esse delete não varrer a tabela. Sem `concurrently` de propósito: ele exige migration fora
// de transação, e pelo pgbouncer (HML) o lock do node-pg-migrate não é liberado na mesma conexão ("Failed to release
// migration lock", visto em 05/11/2026). Tabelas pequenas hoje (60 mil linhas na HML): o lock de escrita dura milissegundos.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('create index if not exists ingest_posicoes_recebidas_recebido_em_idx on public.ingest_posicoes_recebidas (recebido_em)');
  pgm.sql('create index if not exists ingest_eventos_recebidos_recebido_em_idx on public.ingest_eventos_recebidos (recebido_em)');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop index if exists public.ingest_eventos_recebidos_recebido_em_idx');
  pgm.sql('drop index if exists public.ingest_posicoes_recebidas_recebido_em_idx');
}
