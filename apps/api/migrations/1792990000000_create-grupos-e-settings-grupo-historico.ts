import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// docs/PLANO-SETUP-ADMIN.md § 4 e § 8 (decisão 1): grupos de ativos passam a existir no banco (hoje só no
// navegador) — primeiro uso é a camada Grupo do Setup, e Ativos/relatórios filtram por grupo em seguida.
// Um ativo pode estar em vários grupos (`groupIds` no front), por isso tabela de vínculo.
//
// `group_settings`: override por grupo, consultado antes de `client_settings` (resolução: grupo → cliente
// → padrão da plataforma em código). `client_settings_history`: quem mudou o quê, de/para e quando, nas
// duas camadas — também é o que resolve "vale a partir de agora" (valor vigente numa data, usado pelo
// espelho de ponto da jornada).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.asset_groups (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      name text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (client_id, name)
    );

    create table public.asset_group_members (
      client_id uuid not null references public.clients(id) on delete cascade,
      group_id uuid not null references public.asset_groups(id) on delete cascade,
      asset_id uuid not null references public.assets(id) on delete cascade,
      primary key (group_id, asset_id)
    );
    create index on public.asset_group_members (client_id, asset_id);

    create table public.group_settings (
      client_id uuid not null references public.clients(id) on delete cascade,
      group_id uuid not null references public.asset_groups(id) on delete cascade,
      key text not null,
      value jsonb not null,
      updated_at timestamptz not null default now(),
      primary key (group_id, key)
    );

    create table public.client_settings_history (
      id bigint generated always as identity primary key,
      client_id uuid not null references public.clients(id) on delete cascade,
      group_id uuid references public.asset_groups(id) on delete cascade,
      key text not null,
      old_value jsonb,
      new_value jsonb,
      changed_by uuid,
      reason text,
      changed_at timestamptz not null default now()
    );
    create index on public.client_settings_history (client_id, key, changed_at desc);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.client_settings_history;
    drop table public.group_settings;
    drop table public.asset_group_members;
    drop table public.asset_groups;
  `);
}
