-- =====================================================================
-- Módulo de pneus: cadastro, vidas (recapagem), montagens, medições de sulco
-- As regras (validações e cálculos) ficam aqui; o frontend só exibe.
-- =====================================================================

create type public.tire_status as enum ('estoque','montado','recapagem','sucata');
create type public.tire_life_kind as enum ('novo','recapagem');

create table public.tire_settings (
  client_id uuid primary key references public.clients(id) on delete cascade,
  warn_mm numeric(4,1) not null default 5.0,
  removal_mm numeric(4,1) not null default 3.0,
  legal_min_mm numeric(4,1) not null default 1.6,
  default_recap_cost numeric(10,2) not null default 650
);

create table public.tires (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  fire_number text not null,                      -- número gravado (logo + número)
  brand text not null, model text, size text not null, dot text,
  recappable boolean not null default true,
  max_lives int not null default 3,               -- inclui a vida nova
  status public.tire_status not null default 'estoque',
  location text default 'Almoxarifado',
  scrap_reason text, scrapped_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, fire_number),
  check (max_lives between 1 and 8),
  check (recappable or max_lives = 1)
);

create table public.tire_lives (
  id uuid primary key default gen_random_uuid(),
  tire_id uuid not null references public.tires(id) on delete cascade,
  life_no int not null check (life_no >= 1),
  kind public.tire_life_kind not null,
  started_at timestamptz not null default now(),
  cost numeric(10,2) not null check (cost >= 0),
  supplier text, band text,
  initial_tread_mm numeric(4,1) not null check (initial_tread_mm > 0),
  unique (tire_id, life_no),
  check ((life_no = 1) = (kind = 'novo'))
);

create table public.tire_mounts (
  id uuid primary key default gen_random_uuid(),
  tire_id uuid not null references public.tires(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  position text not null,
  life_no int not null,
  mounted_at timestamptz not null default now(),
  km_from numeric(12,1) not null,
  unmounted_at timestamptz,
  km_to numeric(12,1),
  check (km_to is null or km_to >= km_from)
);
-- um pneu só pode estar montado em um lugar; uma posição só pode ter um pneu
create unique index tire_one_active_mount on public.tire_mounts (tire_id) where unmounted_at is null;
create unique index asset_position_free on public.tire_mounts (asset_id, position) where unmounted_at is null;

create table public.tire_measurements (
  id uuid primary key default gen_random_uuid(),
  tire_id uuid not null references public.tires(id) on delete cascade,
  life_no int not null,
  measured_at timestamptz not null default now(),
  km numeric(12,1),
  tread_mm numeric(4,1) not null check (tread_mm >= 0 and tread_mm <= 30),
  source text not null default 'manual' check (source in ('manual','profundimetro_bt','checklist')),
  recorded_by text
);
create index on public.tire_measurements (tire_id, measured_at desc);

-- ---------- Regras ----------
-- Nova vida só se o pneu é recapável, está na recapadora e ainda tem vidas
create or replace function public.tg_tire_life_check() returns trigger language plpgsql as $$
declare t public.tires; n int;
begin
  select * into t from public.tires where id = new.tire_id;
  select coalesce(max(life_no), 0) into n from public.tire_lives where tire_id = new.tire_id;
  if new.life_no <> n + 1 then raise exception 'A vida deve ser a %ª', n + 1; end if;
  if new.kind = 'recapagem' then
    if not t.recappable then raise exception 'Pneu % não é recapável', t.fire_number; end if;
    if new.life_no > t.max_lives then raise exception 'Pneu % já usou as % vidas previstas', t.fire_number, t.max_lives; end if;
    if t.status <> 'recapagem' then raise exception 'Envie o pneu % para a recapadora antes de registrar a nova vida', t.fire_number; end if;
  end if;
  return new;
end $$;
create trigger tire_life_check before insert on public.tire_lives for each row execute function public.tg_tire_life_check();

create or replace function public.fn_mount_tire(p_tire uuid, p_asset uuid, p_position text, p_km numeric) returns uuid
language plpgsql as $$
declare t public.tires; life int; mid uuid;
begin
  select * into t from public.tires where id = p_tire for update;
  if t.status <> 'estoque' then raise exception 'Pneu % não está em estoque (situação: %)', t.fire_number, t.status; end if;
  select max(life_no) into life from public.tire_lives where tire_id = p_tire;
  insert into public.tire_mounts (tire_id, asset_id, position, life_no, km_from) values (p_tire, p_asset, p_position, life, p_km) returning id into mid;
  update public.tires set status = 'montado', location = null where id = p_tire;
  return mid;
end $$;

create or replace function public.fn_unmount_tire(p_tire uuid, p_km numeric, p_dest public.tire_status, p_reason text default null) returns void
language plpgsql as $$
begin
  if p_dest = 'montado' then raise exception 'Destino inválido'; end if;
  update public.tire_mounts set unmounted_at = now(), km_to = p_km where tire_id = p_tire and unmounted_at is null;
  if not found then raise exception 'Pneu não está montado'; end if;
  update public.tires set status = p_dest,
    location = case p_dest when 'estoque' then 'Almoxarifado' when 'recapagem' then 'Recapadora' else null end,
    scrap_reason = case when p_dest = 'sucata' then p_reason end,
    scrapped_at = case when p_dest = 'sucata' then now() end
  where id = p_tire;
end $$;

-- Rodízio entre duas posições do mesmo veículo (uma transação)
create or replace function public.fn_rotate_tires(p_asset uuid, p_pos_a text, p_pos_b text, p_km numeric) returns void
language plpgsql as $$
declare ta uuid; tb uuid; la int; lb int;
begin
  select tire_id, life_no into ta, la from public.tire_mounts where asset_id = p_asset and position = p_pos_a and unmounted_at is null;
  select tire_id, life_no into tb, lb from public.tire_mounts where asset_id = p_asset and position = p_pos_b and unmounted_at is null;
  if ta is null then raise exception 'Posição % está vazia', p_pos_a; end if;
  update public.tire_mounts set unmounted_at = now(), km_to = p_km where asset_id = p_asset and position in (p_pos_a, p_pos_b) and unmounted_at is null;
  insert into public.tire_mounts (tire_id, asset_id, position, life_no, km_from) values (ta, p_asset, p_pos_b, la, p_km);
  if tb is not null then insert into public.tire_mounts (tire_id, asset_id, position, life_no, km_from) values (tb, p_asset, p_pos_a, lb, p_km); end if;
end $$;

-- ---------- Cálculos ----------
create view public.v_tire_overview with (security_invoker = true) as
with cur as (
  select distinct on (l.tire_id) l.tire_id, l.life_no, l.initial_tread_mm from public.tire_lives l order by l.tire_id, l.life_no desc
), last_meas as (
  select distinct on (m.tire_id) m.tire_id, m.tread_mm, m.measured_at
  from public.tire_measurements m join cur on cur.tire_id = m.tire_id and cur.life_no = m.life_no
  order by m.tire_id, m.measured_at desc
), km as (
  select mt.tire_id,
    sum(greatest(0, coalesce(mt.km_to, ak.km, mt.km_from) - mt.km_from)) as km_total,
    sum(greatest(0, coalesce(mt.km_to, ak.km, mt.km_from) - mt.km_from)) filter (where mt.life_no = cur.life_no) as km_life
  from public.tire_mounts mt join cur on cur.tire_id = mt.tire_id
  left join public.v_asset_km ak on ak.asset_id = mt.asset_id
  group by mt.tire_id
), cost as (
  select tire_id, sum(cost) as cost_total from public.tire_lives group by tire_id
)
select t.id as tire_id, t.client_id, t.fire_number, t.brand, t.size, t.status, t.max_lives,
  cur.life_no as current_life, greatest(0, t.max_lives - cur.life_no) as lives_left,
  cur.initial_tread_mm, coalesce(lm.tread_mm, cur.initial_tread_mm) as tread_mm, lm.measured_at as last_measured_at,
  coalesce(km.km_total, 0) as km_total, coalesce(km.km_life, 0) as km_life,
  c.cost_total,
  case when coalesce(km.km_total, 0) > 0 then round(c.cost_total / km.km_total * 1000, 2) end as cost_per_1000km,
  c.cost_total + greatest(0, t.max_lives - cur.life_no) * coalesce(s.default_recap_cost, 650) as projected_cost,
  case
    when coalesce(lm.tread_mm, cur.initial_tread_mm) <= coalesce(s.legal_min_mm, 1.6) then 'ilegal'
    when coalesce(lm.tread_mm, cur.initial_tread_mm) <= coalesce(s.removal_mm, 3.0) then 'retirar'
    when coalesce(lm.tread_mm, cur.initial_tread_mm) <= coalesce(s.warn_mm, 5.0) then 'atencao'
    else 'ok' end as tread_level,
  round(least(1, greatest(0, (cur.initial_tread_mm - coalesce(lm.tread_mm, cur.initial_tread_mm)) / nullif(cur.initial_tread_mm - coalesce(s.removal_mm, 3.0), 0))), 3) as wear_ratio
from public.tires t
join cur on cur.tire_id = t.id
join cost c on c.tire_id = t.id
left join last_meas lm on lm.tire_id = t.id
left join km on km.tire_id = t.id
left join public.tire_settings s on s.client_id = t.client_id;

-- Gasto por mês (compra × recapagem) para o painel e comparativos
create view public.v_tire_spend_monthly with (security_invoker = true) as
select t.client_id, date_trunc('month', l.started_at)::date as month, l.kind, count(*) as qty, sum(l.cost) as total
from public.tire_lives l join public.tires t on t.id = l.tire_id
group by 1, 2, 3;

alter table public.tires enable row level security;
alter table public.tire_lives enable row level security;
alter table public.tire_mounts enable row level security;
alter table public.tire_measurements enable row level security;
alter table public.tire_settings enable row level security;
create policy own_tires on public.tires for all to authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_tire_lives on public.tire_lives for all to authenticated using (exists (select 1 from public.tires t where t.id = tire_id and t.client_id = public.current_client_id()));
create policy own_tire_mounts on public.tire_mounts for all to authenticated using (exists (select 1 from public.tires t where t.id = tire_id and t.client_id = public.current_client_id()));
create policy own_tire_meas on public.tire_measurements for all to authenticated using (exists (select 1 from public.tires t where t.id = tire_id and t.client_id = public.current_client_id()));
create policy own_tire_settings on public.tire_settings for all to authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
