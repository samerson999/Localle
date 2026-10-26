import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Pneus (hoje `tires` no navegador). O estado do pneu (onde está, vida, sulco, km) é derivado das
// movimentações aplicadas em ordem: cada `pneu_movimentos` muda `pneus` na mesma transação (ver
// pneus.service.ts). Níveis de sulco (atenção/retirar/ilegal) vêm do Setup `pneus.*` + mínimo legal
// 1,6 mm (Res. CONTRAN 558/1980) e são calculados na leitura.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.pneus (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      numero_fogo text not null,
      marca text,
      modelo text,
      medida text,
      vidas_max integer not null default 3 check (vidas_max between 1 and 8),
      vida_atual integer not null default 1 check (vida_atual >= 1),
      sulco_inicial_mm numeric(4, 1) not null check (sulco_inicial_mm > 0),
      sulco_atual_mm numeric(4, 1) not null check (sulco_atual_mm >= 0),
      status text not null default 'estoque' check (status in ('estoque', 'montado', 'recapagem', 'descartado')),
      asset_id uuid references public.assets(id) on delete set null,
      posicao text,
      km_montagem numeric(12, 1),
      km_acumulado numeric(12, 1) not null default 0,
      custo_total numeric(12, 2) not null default 0,
      dados jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (client_id, numero_fogo),
      check (vida_atual <= vidas_max),
      check (status <> 'montado' or (asset_id is not null and posicao is not null))
    );
    create index on public.pneus (client_id, status);
    create index on public.pneus (client_id, asset_id) where asset_id is not null;

    create table public.pneu_movimentos (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      pneu_id uuid not null references public.pneus(id) on delete cascade,
      tipo text not null check (tipo in ('compra','montagem','rodizio','retirada','envio_recapagem','recapagem','descarte','medicao')),
      ts timestamptz not null default now(),
      asset_id uuid references public.assets(id) on delete set null,
      posicao text,
      km_veiculo numeric(12, 1),
      sulco_mm numeric(4, 1),
      custo numeric(12, 2),
      obs text,
      criado_por uuid references public.users(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create index on public.pneu_movimentos (client_id, pneu_id, ts desc);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.pneu_movimentos;
    drop table public.pneus;
  `);
}
