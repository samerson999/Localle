-- =====================================================================
-- Base multi-tenant: rastreadoras (tenants), clientes (frotistas) e ativos
-- Regra de acesso: cada usuário enxerga só o client_id do seu token (RLS).
-- =====================================================================

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  modules text[] not null default array['monitoramento','ativos','manutencao','combustivel','checklist','viagens','multas','jornada','ranking','pneus'],
  created_at timestamptz not null default now()
);

create type public.asset_kind as enum ('veiculo','linha_amarela','maquina','equipamento','outro');
create type public.km_mode as enum ('rastreador','manual','mescla');

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind public.asset_kind not null default 'veiculo',
  name text not null,
  plate text,
  brand text, model text, year text,
  km_mode public.km_mode not null default 'mescla',
  km_calculated boolean not null default false,   -- veículo sem leitura de odômetro (item 6)
  created_at timestamptz not null default now()
);
create index on public.assets (client_id);

-- Leituras de odômetro com origem (item 1 e item 6)
create type public.odometer_source as enum ('rastreador_diario','checklist','abastecimento','portaria','os','instalacao','ajuste');

create table public.odometer_readings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  km numeric(12,1) not null check (km >= 0),
  read_at timestamptz not null default now(),
  source public.odometer_source not null,
  source_ref uuid,                 -- id do abastecimento / checklist / OS que gerou a leitura
  recorded_by text,
  photo_url text,
  is_calculated boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.odometer_readings (asset_id, read_at desc);

-- Km atual = última leitura válida, respeitando o modo do ativo
create view public.v_asset_km with (security_invoker = true) as
select a.id as asset_id, a.client_id,
  (select r.km from public.odometer_readings r
    where r.asset_id = a.id
      and (a.km_mode = 'mescla'
           or (a.km_mode = 'rastreador' and r.source = 'rastreador_diario')
           or (a.km_mode = 'manual' and r.source <> 'rastreador_diario'))
    order by r.read_at desc, r.km desc limit 1) as km,
  (select r.read_at from public.odometer_readings r where r.asset_id = a.id order by r.read_at desc limit 1) as last_read_at
from public.assets a;

-- RLS: o token do usuário carrega client_id (claim personalizada)
create or replace function public.current_client_id() returns uuid
language sql stable as $$ select nullif(auth.jwt() ->> 'client_id', '')::uuid $$;

alter table public.clients enable row level security;
alter table public.assets enable row level security;
alter table public.odometer_readings enable row level security;
create policy client_self on public.clients for all to authenticated using (id = public.current_client_id());
create policy client_assets on public.assets for all to authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy client_odometer on public.odometer_readings for all to authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
