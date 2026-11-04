import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Idade de cada atributo (decisão de 04/11/2026): `ultimos_atributos` guarda o último valor de cada chave para sempre,
// e um atributo que o aparelho deixa de mandar continuava aparecendo como atual. Caso real na HML: o Traccar 6.17
// passou a mandar a tensão do JR12 em `power`; o `vin` (718 mV, da queda de energia de 03/11) ficou parado e a tela
// mostrava 0,7 V.
// - `atributos_vistos_em`: chave → server_time do último pacote que trouxe a chave. A tela mostra a idade do valor.
// - `atributos_ausentes_desde`: chave → server_time do primeiro pacote SEM a chave depois de ela ter chegado. Mede a
//   ausência só enquanto o aparelho transmite (aparelho desligado não conta), base do log de atributo que parou.
// - Carga inicial pelas posições reais dos últimos 30 dias (não pela data do último pacote, que daria idade falsa a
//   uma chave parada). Chave mais antiga que isso fica sem data = idade desconhecida.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.rastreador_comunicacao
      add column atributos_vistos_em jsonb not null default '{}'::jsonb,
      add column atributos_ausentes_desde jsonb not null default '{}'::jsonb;

    update public.rastreador_comunicacao rc set atributos_vistos_em = coalesce((
      select jsonb_object_agg(k, ts) from (
        select k, max(p.server_time) as ts
          from public.posicoes p, jsonb_object_keys(p.attributes) k
         where p.rastreador_id = rc.rastreador_id and p.fix_time > now() - interval '30 days'
         group by k
      ) x
    ), '{}'::jsonb);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`alter table public.rastreador_comunicacao drop column atributos_vistos_em, drop column atributos_ausentes_desde;`);
}
