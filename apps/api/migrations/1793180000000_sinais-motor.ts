import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Sinais de motor / rede CAN (decisão de 04/11/2026, docs/PESQUISA-REDE-CAN.md §§ 3 e 6): separar o que o modelo
// PROMETE (catálogo) do que de fato CHEGA em cada instalação (estado por sinal).
// - `rastreador_modelos.suporte_can`: capacidade do equipamento. Padrão `nao_informado`: ausência de ficha conferida
//   não é ausência de suporte, e a plataforma não cobra sinal de modelo sem ficha.
// - `sinais_motor`: sinais que o modelo entrega (capacidade, não garantia — o veículo e a configuração decidem).
// - `atributo_*`: onde o aparelho manda cada sinal, mesmo padrão do mapeamento da telemetria (1793130000000): vazio =
//   chave padrão do Traccar (src/telemetria/sinais-motor.ts); horímetro não tem padrão porque o `hours` do Traccar é
//   contado pela ignição, não lido do painel.
// - `instalacao_sinais`: estado atual de cada sinal por INSTALAÇÃO (não por rastreador: `rastreadores` não tem
//   `client_id`, e o diagnóstico de um cliente não pode seguir o aparelho reinstalado em outro). Uma linha por
//   instalação × sinal; o histórico só ganha linha quando o status muda. FK composta (instalacao_id, client_id): o banco
//   garante que o estado é do mesmo cliente da instalação.
// - Seed só do que foi conferido: FMC125 lê CAN só com adaptador externo (LV-CAN200/ALL-CAN300, wiki da Teltonika);
//   JR12 lê CAN (decoder `jmak` do Traccar + informação do usuário), com os sinais a confirmar no veículo.
const SINAIS = `array['rpm', 'odometro', 'combustivel', 'horimetro']`;
const ATRIBUTO = "~ '^[a-zA-Z][a-zA-Z0-9_]{0,39}$'";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.rastreador_modelos
      add column suporte_can text not null default 'nao_informado'
        check (suporte_can in ('nativo', 'com_acessorio', 'nao', 'nao_informado')),
      add column sinais_motor text[] not null default '{}' check (sinais_motor <@ ${SINAIS}),
      add column atributo_rpm text check (atributo_rpm ${ATRIBUTO}),
      add column atributo_odometro text check (atributo_odometro ${ATRIBUTO}),
      add column atributo_combustivel text check (atributo_combustivel ${ATRIBUTO}),
      add column atributo_horimetro text check (atributo_horimetro ${ATRIBUTO});

    update public.rastreador_modelos set suporte_can = 'com_acessorio'
     where lower(fabricante) = 'teltonika' and lower(nome) = 'fmc125';
    update public.rastreador_modelos set suporte_can = 'nativo'
     where lower(fabricante) = 'jmak' and lower(nome) = 'jr12' and protocolo = 'jmak';

    -- alvo da FK composta: o estado nunca fica com o client_id de um cliente e a instalação de outro
    alter table public.instalacoes add constraint instalacoes_id_client_uniq unique (id, client_id);

    create table public.instalacao_sinais (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      instalacao_id uuid not null,
      rastreador_id uuid not null references public.rastreadores(id) on delete cascade,
      sinal text not null check (sinal = any(${SINAIS})),
      status text not null check (status in ('recebido', 'aguardando', 'nao_recebido', 'fora_do_esperado')),
      motivo text not null,
      -- última leitura VÁLIDA: valor, horário do aparelho (fix_time) e de chegada ao servidor (server_time)
      ultimo_valor double precision,
      ultima_leitura_em timestamptz,
      ultimo_recebimento_em timestamptz,
      atributo_origem text,
      -- posições seguidas em movimento sem o sinal (regra de "não recebido")
      sem_sinal_em_operacao integer not null default 0 check (sem_sinal_em_operacao >= 0),
      -- fix_time da posição mais nova avaliada: pacote atrasado não reabre nem regride o estado
      avaliado_ate timestamptz not null,
      -- atualizado_em do modelo quando o estado foi calculado (mapeamento mudou = leitura com regra nova)
      mapeamento_versao timestamptz,
      atualizado_em timestamptz not null default now(),
      unique (instalacao_id, sinal),
      foreign key (instalacao_id, client_id) references public.instalacoes(id, client_id) on delete cascade
    );
    create index instalacao_sinais_client_idx on public.instalacao_sinais (client_id);
    create index instalacao_sinais_rastreador_idx on public.instalacao_sinais (rastreador_id);

    create table public.instalacao_sinais_historico (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      instalacao_id uuid not null,
      sinal text not null,
      status_anterior text,
      status text not null,
      motivo text not null,
      em timestamptz not null,
      registrado_em timestamptz not null default now(),
      foreign key (instalacao_id, client_id) references public.instalacoes(id, client_id) on delete cascade
    );
    create index instalacao_sinais_historico_idx on public.instalacao_sinais_historico (instalacao_id, sinal, em desc);
    create index instalacao_sinais_historico_client_idx on public.instalacao_sinais_historico (client_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.instalacao_sinais_historico;
    drop table public.instalacao_sinais;
    alter table public.instalacoes drop constraint if exists instalacoes_id_client_uniq;
    alter table public.rastreador_modelos
      drop column suporte_can, drop column sinais_motor, drop column atributo_rpm, drop column atributo_odometro,
      drop column atributo_combustivel, drop column atributo_horimetro;
  `);
}
