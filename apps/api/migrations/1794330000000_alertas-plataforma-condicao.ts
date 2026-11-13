import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Alertas da plataforma definidos no Console da Locale (12/11/2026, continuação de 1794300000000). Além de traduzir o
// alarme que o rastreador manda pronto (`disparo = 'alarme'`, chave = `attributes.alarm` do Traccar), a Locale cria
// alerta por CONDIÇÃO sobre o estado lido do rastreador (`disparo = 'condicao'`: tensão, alimentação, bloqueio, entrada
// digital…), com:
//   - `duracao_min`: a condição precisa se manter esse tempo antes de disparar (oscilação não vira alerta);
//   - `encerra_sozinho`: quando a condição deixa de valer, o alerta aberto fecha sozinho como "normalizado";
//   - `repetir_min`: intervalo mínimo entre dois alertas do mesmo tipo no mesmo veículo.
// `notifica_push`: o alerta vai para o celular (para quem não mudou a preferência do tipo). Vale para todos os disparos.
// `disparo = 'sistema'` = rotina da plataforma (sem posição, sinais do painel): a regra é código, o catálogo só ajusta.
//
// `alerta_tipo_estado`: por tipo × ativo, desde quando a condição vale e qual alerta está aberto por ela.
// `alerta_tipos_cliente`: o cliente desliga, no Setup dele, um alerta da plataforma (todos nascem ligados; só a
// exceção é gravada).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.alerta_tipos
      add column disparo text not null default 'alarme' check (disparo in ('alarme', 'condicao', 'sistema')),
      add column condicoes jsonb,
      add column duracao_min integer not null default 0 check (duracao_min between 0 and 1440),
      add column encerra_sozinho boolean not null default false,
      add column repetir_min integer not null default 15 check (repetir_min between 0 and 1440),
      add column notifica_push boolean not null default false;
  `);
  pgm.sql("update public.alerta_tipos set disparo = 'sistema' where sistema;");
  // mesmo comportamento do worker até aqui: notifica alta e "sem posição" (em todo nível)
  pgm.sql("update public.alerta_tipos set notifica_push = (coalesce(prioridade = 'alta', false) or chave = 'sem_posicao');");
  pgm.sql(`
    alter table public.alerta_tipos
      add constraint alerta_tipos_condicao_completa check ((disparo = 'condicao') = (condicoes is not null)),
      add constraint alerta_tipos_sistema_coerente check (sistema = (disparo = 'sistema'));
  `);

  pgm.sql(`
    create table public.alerta_tipo_estado (
      chave text not null references public.alerta_tipos(chave) on delete cascade,
      asset_id uuid not null references public.assets(id) on delete cascade,
      client_id uuid not null references public.clients(id) on delete cascade,
      desde timestamptz not null,
      alerta_id uuid references public.alertas(id) on delete set null,
      ultimo_disparo timestamptz,
      primary key (chave, asset_id)
    );
  `);
  pgm.sql('create index on public.alerta_tipo_estado (client_id);');

  pgm.sql(`
    create table public.alerta_tipos_cliente (
      client_id uuid not null references public.clients(id) on delete cascade,
      chave text not null references public.alerta_tipos(chave) on delete cascade,
      ligado boolean not null,
      alterado_por uuid references public.users(id) on delete set null,
      alterado_em timestamptz not null default now(),
      primary key (client_id, chave)
    );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('alerta_tipos_cliente');
  pgm.dropTable('alerta_tipo_estado');
  pgm.sql(`
    alter table public.alerta_tipos
      drop constraint alerta_tipos_condicao_completa, drop constraint alerta_tipos_sistema_coerente,
      drop column disparo, drop column condicoes, drop column duracao_min, drop column encerra_sozinho,
      drop column repetir_min, drop column notifica_push;
  `);
}
