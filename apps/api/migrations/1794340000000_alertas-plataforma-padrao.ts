import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Alertas PADRÃO da plataforma (12/11/2026), no molde de Samsara/Geotab: o tipo é fixo (o que ele mede não muda) e só os
// parâmetros variam — o limite (valor da 1ª condição) e a duração. A Locale define o padrão no Console; o cliente ajusta
// para a operação dele no Setup (`alerta_tipos_cliente.valor`/`duracao_min`, null = o padrão da plataforma).
// A condição livre (disparo 'condicao' sem `padrao`) continua como recurso avançado da Locale.
// "Alimentação cortada" e "bloqueio pendente" não entram: já são detectados (alarme powerCut/estado e comandos).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.alerta_tipos add column padrao boolean not null default false;
    alter table public.alerta_tipos add constraint alerta_tipos_padrao_por_condicao check (not padrao or disparo = 'condicao');
    alter table public.alerta_tipos_cliente
      add column valor numeric,
      add column duracao_min integer check (duracao_min between 0 and 1440);
  `);
  pgm.sql(`
    insert into public.alerta_tipos (chave, disparo, padrao, nome, prioridade, exige_tratamento, gera_alerta, notifica_push, condicoes, duracao_min, encerra_sozinho, repetir_min) values
      ('bateria_veiculo_baixa', 'condicao', true, 'Bateria do veículo baixa', 'media', false, true, true,
        '[{"field":"tensao","op":"<","value":"11.5"}]', 10, true, 240),
      ('gps_fraco', 'condicao', true, 'GPS com poucos satélites', 'baixa', false, true, false,
        '[{"field":"satelites","op":"<","value":"4"}]', 15, true, 240),
      ('sinal_celular_fraco', 'condicao', true, 'Sinal da rede celular fraco', 'baixa', false, true, false,
        '[{"field":"sinal_gsm","op":"<","value":"1"}]', 30, true, 240)
    on conflict (chave) do nothing;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    delete from public.alerta_tipos where chave in ('bateria_veiculo_baixa', 'gps_fraco', 'sinal_celular_fraco');
    alter table public.alerta_tipos_cliente drop column valor, drop column duracao_min;
    alter table public.alerta_tipos drop constraint alerta_tipos_padrao_por_condicao, drop column padrao;
  `);
}
