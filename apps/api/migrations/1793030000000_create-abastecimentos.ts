import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Abastecimentos (hoje `fuelings` no navegador). Divergências nota × lançamento e km × rastreador são
// calculadas na leitura com as tolerâncias do Setup (`combustivel.*`), não gravadas. `nf` guarda a nota
// (litros, total, data, cnpj, chave) quando conferida; `km_rastreador` é o odômetro do rastreador no
// instante do lançamento, preenchido quando houver posição (ingestão) — por ora chega do cliente.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.abastecimentos (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      asset_id uuid not null references public.assets(id) on delete cascade,
      motorista_id uuid references public.motoristas(id) on delete set null,
      ts timestamptz not null,
      odometro numeric(12, 1) not null check (odometro >= 0),
      litros numeric(10, 2) not null check (litros > 0),
      total numeric(12, 2) not null check (total >= 0),
      preco_litro numeric(8, 3),
      combustivel text not null,
      posto text,
      posto_cnpj text,
      km_rastreador numeric(12, 1),
      nf jsonb,
      dados jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index on public.abastecimentos (client_id, ts desc);
    create index on public.abastecimentos (client_id, asset_id, ts desc);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('abastecimentos');
}
