import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// docs/ARQUITETURA-BACKEND.md § 2.4 e docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.7: compressão após 7 dias
// nas duas hypertables, segmentada por rastreador (as consultas de replay/relatório filtram por rastreador
// e período). Igual para todo cliente. Retenção NÃO entra aqui: `add_retention_policy` vale para a
// hypertable inteira e a retenção é por plano do cliente (`contrato_versoes.historico_meses`) — rotina
// própria em apps/api/src/retencao.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.posicoes set (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'rastreador_id',
      timescaledb.compress_orderby = 'fix_time desc'
    );
    select add_compression_policy('posicoes', interval '7 days');

    alter table public.eventos set (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'rastreador_id',
      timescaledb.compress_orderby = 'ts desc'
    );
    select add_compression_policy('eventos', interval '7 days');
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    select remove_compression_policy('eventos');
    select decompress_chunk(c, true) from show_chunks('eventos') c;
    alter table public.eventos set (timescaledb.compress = false);

    select remove_compression_policy('posicoes');
    select decompress_chunk(c, true) from show_chunks('posicoes') c;
    alter table public.posicoes set (timescaledb.compress = false);
  `);
}
