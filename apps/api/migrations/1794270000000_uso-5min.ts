import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Resumo de uso da frota de 5 em 5 minutos por ativo (Home do gestor, 11/11/2026): km, tempo em movimento e veículos
// usados por dia, sem varrer `posicoes` a cada abertura (2.000 veículos × 8 dias × ~2.900 posições/dia não cabem numa
// tela inicial). Agregado contínuo do TimescaleDB:
// - `dist_m`: comprimento da trajetória dos pontos em movimento (> 2 km/h) dentro do bloco, pela geometria — o
//   `odometer_m` só existe quando o aparelho manda odômetro. O trecho entre um bloco e o seguinte sai de `p_fim`/`p_ini`
//   na consulta (MonitoringRepository.usoDiario).
// - `materialized_only = false`: a parte ainda não materializada vem das posições na hora (o bloco atual aparece sem
//   esperar a política).
// - Política: rematerializa os últimos 3 dias a cada 10 minutos (posições atrasadas da fila entram); a compressão de
//   `posicoes` é aos 7 dias, fora da janela.
// `create materialized view ... with (timescaledb.continuous)` não roda dentro de transação.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction();
  pgm.sql(`
    create materialized view public.uso_5min
    with (timescaledb.continuous, timescaledb.materialized_only = false) as
    select client_id, asset_id, time_bucket('5 minutes', fix_time) as bucket,
      count(*)::int as amostras,
      max(speed_kmh)::float8 as vel_max,
      st_length(st_makeline(geom order by fix_time) filter (where speed_kmh > 2)::geography)::float8 as dist_m,
      first(geom, fix_time) as p_ini,
      last(geom, fix_time) as p_fim
    from public.posicoes
    where valid and client_id is not null and asset_id is not null
    group by client_id, asset_id, bucket
    with no data;
  `);
  pgm.sql(`create index on public.uso_5min (client_id, bucket desc);`);
  pgm.sql(`
    select add_continuous_aggregate_policy('public.uso_5min',
      start_offset => interval '3 days', end_offset => interval '10 minutes', schedule_interval => interval '10 minutes');
  `);
  // histórico já existente: materializa uma vez (fora de transação, como o create)
  pgm.sql(`call refresh_continuous_aggregate('public.uso_5min', null, now() - interval '10 minutes');`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction();
  pgm.sql('drop materialized view if exists public.uso_5min;');
}
