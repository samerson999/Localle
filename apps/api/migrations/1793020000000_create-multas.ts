import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Multas (hoje `fines` no navegador). Prazo de indicação do condutor, risco de suspensão da CNH e demais
// regras ficam em packages/shared/src/fines.ts + Setup (`multas.*`); aqui só o registro. `auto` + `orgao`
// identificam a autuação (uma mesma autuação não entra duas vezes no mesmo cliente).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.multas (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      auto text not null,
      orgao text not null default '',
      asset_id uuid not null references public.assets(id) on delete cascade,
      motorista_id uuid references public.motoristas(id) on delete set null,
      ts timestamptz not null,
      local text not null,
      codigo text not null,
      descricao text not null,
      gravidade text not null check (gravidade in ('Leve','Média','Grave','Gravíssima')),
      pontos integer not null check (pontos between 0 and 7),
      valor numeric(12, 2) not null check (valor >= 0),
      notificado_em date,
      vencimento date not null,
      status text not null default 'aberta'
        check (status in ('aberta','condutor_indicado','paga','recurso','recurso_indeferido','cancelada')),
      indicado_em timestamptz,
      origem text not null default 'manual',
      dados jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (client_id, auto, orgao)
    );
    create index on public.multas (client_id, ts desc);
    create index on public.multas (client_id, motorista_id, ts desc);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('multas');
}
