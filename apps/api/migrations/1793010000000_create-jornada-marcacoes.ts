import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Marcações de jornada (Lei 13.103/2015), hoje `journey` no navegador. Cada linha é um carimbo de
// início/fim de etapa; o espelho de ponto é calculado por `computeDays` de packages/shared/src/jornada.ts
// com os limites do Setup vigentes na data (`aplicacao: 'agora'`). `origem` diz de onde veio o carimbo
// (teclado do rastreador, app, manual pelo gestor); correção manual guarda quem fez.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.jornada_marcacoes (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      motorista_id uuid not null references public.motoristas(id) on delete cascade,
      asset_id uuid references public.assets(id) on delete set null,
      ts timestamptz not null,
      tipo text not null check (tipo in (
        'inicio_jornada','fim_jornada','inicio_direcao','fim_direcao','inicio_refeicao','fim_refeicao',
        'inicio_espera','fim_espera','inicio_descanso','fim_descanso')),
      origem text not null default 'manual' check (origem in ('teclado','app','rastreador','manual')),
      criado_por uuid references public.users(id) on delete set null,
      criado_em timestamptz not null default now(),
      unique (motorista_id, ts, tipo)
    );
    create index on public.jornada_marcacoes (client_id, motorista_id, ts);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('jornada_marcacoes');
}
