import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Identificação do motorista pelo rastreador (iButton/RFID/cartão, 17/11/2026 — PRODUCT.md › Identificação do motorista).
//
// - `motoristas.codigo_identificacao`: o código do cartão/tag como o gestor digitou. `codigo_identificacao_norm` é o mesmo
//   código sem separadores, em maiúsculas e sem zeros à esquerda — a mesma normalização de
//   src/motoristas/identificacao-motorista.ts (`normalizarCodigo`), para "0000A1B2", "a1:b2" e "A1B2" serem o mesmo cartão
//   seja qual for o aparelho que leu. Um código por motorista ativo no cliente.
// - `rastreador_modelos.atributo_motorista`: chave do atributo em que o modelo manda o código; vazio = `driverUniqueId`,
//   a chave padrão do Traccar (decisão de 01/11/2026: nada de regra por protocolo em código, o modelo fora do padrão é
//   configurado na tela).
// - `motorista_vinculos`: histórico motorista × veículo, com origem (`rastreador` hoje; `app`/`escala` pela mesma
//   especificação). `motorista_id` null = código lido que ainda não está cadastrado (o gestor vê o código e cadastra).
//   Um vínculo aberto por veículo e origem.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.motoristas add column codigo_identificacao text;
    alter table public.motoristas add column codigo_identificacao_norm text generated always as
      (nullif(ltrim(upper(regexp_replace(codigo_identificacao, '[^0-9A-Za-z]', '', 'g')), '0'), '')) stored;
    create unique index motoristas_codigo_identificacao_uidx on public.motoristas (client_id, codigo_identificacao_norm)
      where codigo_identificacao_norm is not null and desativado_em is null;

    alter table public.rastreador_modelos add column atributo_motorista text;

    create table public.motorista_vinculos (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      asset_id uuid not null references public.assets(id) on delete cascade,
      motorista_id uuid references public.motoristas(id) on delete set null,
      origem text not null check (origem in ('rastreador', 'app', 'escala')),
      codigo text,
      rastreador_id uuid references public.rastreadores(id) on delete set null,
      inicio timestamptz not null,
      fim timestamptz,
      encerrado_por text check (encerrado_por in ('troca', 'sem_codigo', 'ignicao_desligada')),
      criado_em timestamptz not null default now(),
      check (fim is null or fim >= inicio),
      check (origem <> 'rastreador' or codigo is not null)
    );
    create unique index motorista_vinculos_aberto_uidx on public.motorista_vinculos (asset_id, origem) where fim is null;
    create index on public.motorista_vinculos (client_id, inicio desc);
    create index on public.motorista_vinculos (client_id, motorista_id) where fim is null;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.motorista_vinculos;
    alter table public.rastreador_modelos drop column atributo_motorista;
    drop index public.motoristas_codigo_identificacao_uidx;
    alter table public.motoristas drop column codigo_identificacao_norm;
    alter table public.motoristas drop column codigo_identificacao;
  `);
}
