import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Manutenção (hoje `plans`/`workOrders` no navegador). Plano preventivo por km, tempo ou ambos, com
// antecedência do aviso e prazo de crítico próprio (vazio = herda do Setup `manutencao.critico_apos_*`).
// OS: preventiva (ligada a um plano) ou corretiva; o fluxo de estados é o da tela
// (aberta → orcamento → aprovada → em_execucao → concluida | cancelada). Orçamentos, evidências,
// comentários, itens e nota ficam em `dados` (estruturas da tela, sem consulta por SQL hoje).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.manutencao_planos (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null,
      servico text not null,
      itens text not null default '',
      gatilho text not null check (gatilho in ('km', 'tempo', 'ambos')),
      km_intervalo integer not null default 0 check (km_intervalo >= 0),
      dias_intervalo integer not null default 0 check (dias_intervalo >= 0),
      antecedencia_km integer not null default 0 check (antecedencia_km >= 0),
      antecedencia_dias integer not null default 0 check (antecedencia_dias >= 0),
      critico_dias integer check (critico_dias is null or critico_dias between 1 and 90),
      critico_km integer check (critico_km is null or critico_km between 100 and 50000),
      ativo boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (gatilho = 'tempo' or km_intervalo > 0),
      check (gatilho = 'km' or dias_intervalo > 0)
    );
    create index on public.manutencao_planos (client_id);

    create table public.manutencao_plano_ativos (
      client_id uuid not null references public.clients(id) on delete cascade,
      plano_id uuid not null references public.manutencao_planos(id) on delete cascade,
      asset_id uuid not null references public.assets(id) on delete cascade,
      primary key (plano_id, asset_id)
    );
    create index on public.manutencao_plano_ativos (client_id, asset_id);

    create table public.ordens_servico (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      numero bigint generated always as identity,
      asset_id uuid not null references public.assets(id) on delete cascade,
      plano_id uuid references public.manutencao_planos(id) on delete set null,
      tipo text not null check (tipo in ('preventiva', 'corretiva')),
      titulo text not null,
      descricao text,
      servicos text[] not null default '{}',
      status text not null default 'aberta'
        check (status in ('aberta','orcamento','aprovada','em_execucao','concluida','cancelada')),
      nao_planejada boolean not null default false,
      aberta_em timestamptz not null default now(),
      entrada_oficina_em timestamptz,
      liberada_em timestamptz,
      odometro numeric(12, 1),
      custo numeric(12, 2) not null default 0 check (custo >= 0),
      fornecedor text,
      dados jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (status <> 'concluida' or liberada_em is not null)
    );
    create index on public.ordens_servico (client_id, aberta_em desc);
    create index on public.ordens_servico (client_id, asset_id, status);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.ordens_servico;
    drop table public.manutencao_plano_ativos;
    drop table public.manutencao_planos;
  `);
}
