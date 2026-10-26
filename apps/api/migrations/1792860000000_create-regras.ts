import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Regras de alerta do cliente (tela Alertas › Regras), avaliadas no backend a cada posição — antes só
// rodavam no navegador (evalRule no processTick). Condições/ações em jsonb: a forma é validada na API e o
// banco não consulta dentro delas. `regra_disparos` guarda o último disparo por regra × ativo para o
// intervalo mínimo entre alertas repetidos (mesmos 15 min da simulação), medido no horário da posição.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.regras (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null,
      ativa boolean not null default true,
      prioridade text not null check (prioridade in ('alta', 'media', 'baixa')),
      condicoes jsonb not null,
      acoes jsonb not null default '{}',
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      removida_em timestamptz
    );
  `);
  pgm.sql('create index on public.regras (client_id) where removida_em is null and ativa;');

  pgm.sql(`
    create table public.regra_disparos (
      regra_id uuid not null references public.regras(id) on delete cascade,
      asset_id uuid not null references public.assets(id) on delete cascade,
      ultimo_em timestamptz not null,
      primary key (regra_id, asset_id)
    );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('regra_disparos');
  pgm.dropTable('regras');
}
