import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Km do resumo de uso pela trajetória de TODOS os pontos válidos do bloco, não só dos que estavam a mais de 2 km/h.
// Conferência na HML em 12/11/2026 (8 dias, 6 veículos rodando): o km da tela ficava 2–10% abaixo do odômetro do aparelho
// e do totalDistance do Traccar (ex.: 49,3 km × 54,9 km), porque a arrancada e a chegada (pontos lentos) e parte dos
// trechos entre blocos ficavam de fora. A trajetória com todos os pontos ficou a 0,1–0,4% dos dois; veículo parado somou
// no máximo ~0,5 km/dia de oscilação do GPS — o mesmo que o Traccar soma, e abaixo do 1 km que conta "rodou no dia".
// Continuous aggregate não aceita mudar a definição: recria com o mesmo nome, índice e política (1794270000000).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction();
  pgm.sql('drop materialized view if exists public.uso_5min;');
  pgm.sql(`
    create materialized view public.uso_5min
    with (timescaledb.continuous, timescaledb.materialized_only = false) as
    select client_id, asset_id, time_bucket('5 minutes', fix_time) as bucket,
      count(*)::int as amostras,
      max(speed_kmh)::float8 as vel_max,
      st_length(st_makeline(geom order by fix_time)::geography)::float8 as dist_m,
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
  pgm.sql(`call refresh_continuous_aggregate('public.uso_5min', null, now() - interval '10 minutes');`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction();
  pgm.sql('drop materialized view if exists public.uso_5min;');
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
  pgm.sql(`call refresh_continuous_aggregate('public.uso_5min', null, now() - interval '10 minutes');`);
}
