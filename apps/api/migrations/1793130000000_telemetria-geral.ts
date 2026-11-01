import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Telemetria geral (decisão de 01/11/2026): a plataforma lê os atributos pelas chaves padrão do Traccar (`power`,
// `sat`, `rssi`, `blocked`) e só o modelo que foge do padrão ganha mapeamento — no catálogo, pela tela do admin,
// nunca em código por protocolo (apps/api/src/telemetria/leitura.ts).
// - `rastreador_modelos`: atributo da tensão externa (ex.: `adc1`, `vin`; vazio = `power`), escala máxima do sinal
//   (vazio = 0 a 5) e atributo de bloqueio (vazio = `blocked`).
// - `rastreador_comunicacao.ultimos_atributos`: último valor conhecido de cada atributo do rastreador. Há aparelho
//   que manda cada dado num pacote (o GT06 manda ACC/sinal/bloqueio no heartbeat e a tensão em outro); guardar o
//   último aqui não depende de configurar o Traccar e serve a qualquer protocolo. `atributos_em` (horário de
//   recebimento no Traccar) impede pacote reenviado/atrasado de sobrescrever valor mais novo.
// - Seed: os dois modelos da HML fora do padrão, conferidos com payload real (GT06: tensão em `adc1`, sinal 0–4;
//   JR12: tensão em `vin` em mV, sinal 0–31). O JR12 foi cadastrado pela tela, por isso o filtro por protocolo.
const ATRIBUTO = "~ '^[a-zA-Z][a-zA-Z0-9_]{0,39}$'";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.rastreador_modelos
      add column atributo_tensao text check (atributo_tensao ${ATRIBUTO}),
      add column sinal_max integer check (sinal_max between 1 and 100),
      add column atributo_bloqueio text check (atributo_bloqueio ${ATRIBUTO});

    alter table public.rastreador_comunicacao
      add column ultimos_atributos jsonb not null default '{}'::jsonb,
      add column atributos_em timestamptz;

    update public.rastreador_modelos set atributo_tensao = 'adc1', sinal_max = 4 where protocolo = 'gt06' and fabricante = 'EVOO-X';
    update public.rastreador_modelos set atributo_tensao = 'vin', sinal_max = 31 where protocolo = 'jmak';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.rastreador_comunicacao drop column ultimos_atributos, drop column atributos_em;
    alter table public.rastreador_modelos drop column atributo_tensao, drop column sinal_max, drop column atributo_bloqueio;
  `);
}
