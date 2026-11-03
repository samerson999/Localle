import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Histórico de relatórios gerados (tela Relatórios › "Relatórios recentes"). Só o registro do que foi exportado
// (tipo, período, filtros em texto, quantidade de linhas, formato, quem gerou) — o arquivo em si não é guardado.
// Visível para toda a empresa (decisão do usuário em 02/11/2026). `user_id` nulo = gerado por acesso de suporte
// ou por usuário já removido.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.relatorios_gerados (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      user_id uuid references public.users(id) on delete set null,
      tipo text not null check (tipo in ('cercas', 'velocidade', 'posicoes', 'passou_por_aqui', 'uso')),
      periodo_inicio timestamptz not null,
      periodo_fim timestamptz not null,
      filtros text not null default '' check (length(filtros) <= 500),
      registros integer not null check (registros >= 0),
      formato text not null check (formato in ('pdf', 'xlsx', 'csv')),
      created_at timestamptz not null default now(),
      check (periodo_fim >= periodo_inicio)
    );
    create index relatorios_gerados_client_created_idx on public.relatorios_gerados (client_id, created_at desc);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop table public.relatorios_gerados');
}
