import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Checklist (hoje `checklistTemplates`/`checklistResponses` no navegador). Modelo: agenda (diário,
// semanal, mensal, ciclo, datas), alvos (grupos de respondentes/pessoas) e perguntas — estruturas da tela,
// validadas na API e guardadas em jsonb (o cálculo de ocorrências/adesão é `occurrences` de
// packages/shared/src/checklist.ts). Resposta: respostas por pergunta em jsonb e `nao_conformidades`
// contadas na gravação pela regra compartilhada `isFlagged` (consulta rápida no "Precisa de você").
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.checklist_modelos (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null,
      ativo boolean not null default true,
      agenda jsonb not null,
      alvos jsonb not null default '{"groupIds":[],"personIds":[]}',
      perguntas jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index on public.checklist_modelos (client_id);

    create table public.checklist_respostas (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      modelo_id uuid not null references public.checklist_modelos(id) on delete cascade,
      motorista_id uuid references public.motoristas(id) on delete set null,
      asset_id uuid references public.assets(id) on delete set null,
      respondente text,
      iniciado_em timestamptz not null,
      finalizado_em timestamptz not null,
      respostas jsonb not null,
      nao_conformidades integer not null default 0,
      created_at timestamptz not null default now(),
      check (finalizado_em >= iniciado_em)
    );
    create index on public.checklist_respostas (client_id, finalizado_em desc);
    create index on public.checklist_respostas (client_id, modelo_id, finalizado_em desc);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.checklist_respostas;
    drop table public.checklist_modelos;
  `);
}
