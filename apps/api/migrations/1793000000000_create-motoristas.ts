import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Motoristas do cliente (hoje só no navegador: `drivers` em apps/web/src/lib/seed.ts). Base de jornada,
// multas, abastecimentos, checklist e ranking. `assets.motorista_id` é o motorista do cadastro do veículo
// (origem "escala"/cadastro, confiança baixa — docs/PLANO-SETUP-ADMIN.md § 3.15); o vínculo no instante é
// resolvido pelos registros (portaria, viagem, checklist, abastecimento), não por esta coluna.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.motoristas (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null,
      cnh text,
      cnh_categoria text check (cnh_categoria is null or cnh_categoria in ('A','B','C','D','E','AB','AC','AD','AE')),
      cnh_validade date,
      toxicologico_validade date,
      telefone text,
      regime text not null default 'cargas' check (regime in ('cargas', 'passageiros')),
      ear boolean not null default false,
      desativado_em timestamptz,
      dados jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index on public.motoristas (client_id, nome);
    create unique index motoristas_cnh_uidx on public.motoristas (client_id, cnh) where cnh is not null and desativado_em is null;

    alter table public.assets add column motorista_id uuid references public.motoristas(id) on delete set null;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.assets drop column motorista_id;
    drop table public.motoristas;
  `);
}
