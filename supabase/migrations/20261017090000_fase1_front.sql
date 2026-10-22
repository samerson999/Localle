-- =====================================================================
-- Fase 1: ligação do front (manutenção item 1 + pneus)
-- =====================================================================

-- ---------- Acesso de estudo ----------
-- Em produção o client_id vem do login (app_metadata do Supabase Auth).
-- Para estudo local, a chave anon enxerga apenas o "cliente de desenvolvimento".
-- REMOVER o fallback anon antes de qualquer uso real.
create table public.dev_settings (id int primary key default 1 check (id = 1), dev_client_id uuid references public.clients(id));

create or replace function public.current_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'client_id', '')::uuid,
    nullif(auth.jwt() ->> 'client_id', '')::uuid,
    case when coalesce(auth.jwt() ->> 'role', 'anon') = 'anon' then (select dev_client_id from public.dev_settings where id = 1) end)
$$;

-- todas as políticas passam a valer também para anon (estudo local)
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('alter policy %I on public.%I to anon, authenticated', p.policyname, p.tablename);
  end loop;
end $$;

-- ---------- Ativos vindos do simulador ----------
alter table public.assets add column local_ref text;
create unique index assets_local_ref on public.assets (client_id, local_ref);

-- ---------- Odômetro: registro validado com origem ----------
create or replace function public.fn_register_odometer(p_asset uuid, p_km numeric, p_source public.odometer_source, p_ref uuid default null, p_by text default null, p_photo text default null, p_at timestamptz default now())
returns uuid language plpgsql as $$
declare last_km numeric; rid uuid; cid uuid;
begin
  select client_id into cid from public.assets where id = p_asset;
  if cid is null then raise exception 'Ativo não encontrado'; end if;
  select km into last_km from public.odometer_readings where asset_id = p_asset and source <> 'rastreador_diario' order by read_at desc limit 1;
  if p_source not in ('ajuste', 'instalacao', 'rastreador_diario') and last_km is not null and p_km < last_km then
    raise exception 'Km % menor que o último lançado (%)', p_km, last_km;
  end if;
  insert into public.odometer_readings (client_id, asset_id, km, read_at, source, source_ref, recorded_by, photo_url)
  values (cid, p_asset, p_km, p_at, p_source, p_ref, p_by, p_photo) returning id into rid;
  return rid;
end $$;

-- ---------- OS: orçamentos, comentários, evidências, nota fiscal ----------
alter table public.work_orders
  add column description text, add column supplier text,
  add column approved_by text, add column approved_at timestamptz,
  add column nf_number text, add column nf_key text, add column nf_value numeric(12,2),
  add column nf_erp text not null default 'nenhum', add column nf_synced_at timestamptz,
  add column nf_file_name text, add column nf_file_data text;

create table public.work_order_quotes (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  supplier text not null default '', value numeric(12,2) not null default 0, days int, warranty text,
  file_name text, file_data text, is_winner boolean not null default false
);
create unique index one_winner_per_wo on public.work_order_quotes (work_order_id) where is_winner;
create or replace function public.tg_max_quotes() returns trigger language plpgsql as $$
begin if (select count(*) from public.work_order_quotes where work_order_id = new.work_order_id) >= 3 then raise exception 'Máximo de 3 orçamentos por OS'; end if; return new; end $$;
create trigger max_quotes before insert on public.work_order_quotes for each row execute function public.tg_max_quotes();

create table public.work_order_comments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  author text not null, body text not null, created_at timestamptz not null default now()
);
-- evidências guardadas como data URL para estudo; em produção usar Supabase Storage
create table public.work_order_evidences (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  kind text not null, name text, data text not null, created_at timestamptz not null default now()
);

create or replace function public.fn_approve_quote(p_wo uuid, p_quote uuid, p_by text) returns void language plpgsql as $$
declare q public.work_order_quotes;
begin
  select * into q from public.work_order_quotes where id = p_quote and work_order_id = p_wo;
  if q.id is null then raise exception 'Orçamento não pertence a esta OS'; end if;
  update public.work_order_quotes set is_winner = false where work_order_id = p_wo;
  update public.work_order_quotes set is_winner = true where id = p_quote;
  update public.work_orders set status = 'aprovada', approved_by = p_by, approved_at = now(), supplier = q.supplier, cost = q.value where id = p_wo;
  insert into public.work_order_comments (work_order_id, author, body) values (p_wo, p_by, format('Serviço autorizado com %s (R$ %s).', q.supplier, q.value));
end $$;

create or replace function public.fn_complete_work_order(p_wo uuid, p_km numeric, p_cost numeric default null, p_by text default null) returns void language plpgsql as $$
declare w public.work_orders;
begin
  select * into w from public.work_orders where id = p_wo for update;
  if w.status in ('concluida', 'cancelada') then raise exception 'OS já encerrada'; end if;
  if array_length(w.service_codes, 1) > 0 and p_km is null then raise exception 'Informe o km da OS para recalcular os planos'; end if;
  update public.work_orders set status = 'concluida', executed_at = now(), shop_in_at = coalesce(shop_in_at, created_at), odometer_at = p_km, cost = coalesce(p_cost, cost) where id = p_wo;
  if p_km is not null then perform public.fn_register_odometer(w.asset_id, p_km, 'os', p_wo, p_by); end if;
  perform public.fn_evaluate_maintenance();
end $$;

-- ---------- Situação de cada plano por ativo (o front só exibe) ----------
create view public.v_maintenance_status with (security_invoker = true) as
select p.id as plan_id, p.client_id, p.name as plan_name, p.service_code, p.trigger, pa.asset_id, a.name as asset_name,
  coalesce(le.odometer_at, pa.baseline_km) as last_km, coalesce(le.executed_at::date, pa.baseline_date) as last_date,
  le.id as last_wo_id, le.number as last_wo_number, le.type as last_wo_type,
  case when p.trigger <> 'dias' then coalesce(le.odometer_at, pa.baseline_km) + p.km_interval end as due_km,
  case when p.trigger <> 'km' then coalesce(le.executed_at::date, pa.baseline_date) + p.days_interval end as due_date,
  ak.km as current_km,
  case when p.trigger <> 'dias' then coalesce(le.odometer_at, pa.baseline_km) + p.km_interval - ak.km end as km_left,
  case when p.trigger <> 'km' then coalesce(le.executed_at::date, pa.baseline_date) + p.days_interval - current_date end as days_left,
  ow.id as open_wo_id, ow.number as open_wo_number, ow.level as open_wo_level
from public.maintenance_plans p
join public.maintenance_plan_assets pa on pa.plan_id = p.id
join public.assets a on a.id = pa.asset_id
left join public.v_asset_km ak on ak.asset_id = pa.asset_id
left join lateral (select wo.* from public.work_orders wo where wo.asset_id = pa.asset_id and wo.status = 'concluida' and p.service_code = any (wo.service_codes) order by wo.executed_at desc limit 1) le on true
left join lateral (select wo.* from public.work_orders wo where wo.plan_id = p.id and wo.asset_id = pa.asset_id and wo.status not in ('concluida', 'cancelada') limit 1) ow on true
where p.active;

-- ---------- Barra de alertas críticos (todas as telas) ----------
create view public.v_critical_alerts with (security_invoker = true) as
select 'os' as kind, wo.id as ref_id, wo.client_id, format('OS #%s crítica · %s', wo.number, a.name) as title, wo.title as detail,
  coalesce((select max(changed_at) from public.work_order_level_history h where h.work_order_id = wo.id), wo.created_at) as since
from public.work_orders wo join public.assets a on a.id = wo.asset_id
where wo.level = 'critico' and wo.status not in ('concluida', 'cancelada')
union all
select 'pneu', t.tire_id, t.client_id, format('Pneu %s abaixo do mínimo legal', t.fire_number), format('%s mm', t.tread_mm), t.last_measured_at
from public.v_tire_overview t where t.status = 'montado' and t.tread_level = 'ilegal';

-- Caixa de saída dos e-mails de escalonamento
create view public.v_outbox with (security_invoker = true) as
select n.id, n.created_at, n.level, n.status, r.name as recipient, r.email, wo.number, wo.title, a.name as asset_name, wo.client_id
from public.alert_notifications n
join public.work_orders wo on wo.id = n.work_order_id
join public.assets a on a.id = wo.asset_id
left join public.alert_recipients r on r.id = n.recipient_id;

-- ---------- Pneus: operações validadas ----------
create or replace function public.fn_create_tire(p_fire text, p_brand text, p_model text, p_size text, p_dot text, p_recappable boolean, p_max_lives int, p_cost numeric, p_supplier text, p_tread numeric, p_purchased_at timestamptz default now(), p_location text default 'Almoxarifado')
returns uuid language plpgsql as $$
declare tid uuid; cid uuid := public.current_client_id();
begin
  if cid is null then raise exception 'Sem cliente no contexto'; end if;
  insert into public.tires (client_id, fire_number, brand, model, size, dot, recappable, max_lives, location)
  values (cid, upper(p_fire), p_brand, p_model, p_size, p_dot, p_recappable, case when p_recappable then p_max_lives else 1 end, p_location) returning id into tid;
  insert into public.tire_lives (tire_id, life_no, kind, started_at, cost, supplier, initial_tread_mm) values (tid, 1, 'novo', p_purchased_at, p_cost, p_supplier, p_tread);
  return tid;
end $$;

create or replace function public.fn_measure_tire(p_tire uuid, p_mm numeric, p_km numeric default null, p_source text default 'manual', p_by text default null) returns void language plpgsql as $$
declare life int;
begin
  select max(life_no) into life from public.tire_lives where tire_id = p_tire;
  if life is null then raise exception 'Pneu não encontrado'; end if;
  insert into public.tire_measurements (tire_id, life_no, km, tread_mm, source, recorded_by) values (p_tire, life, p_km, p_mm, p_source, p_by);
end $$;

create or replace function public.fn_send_to_recap(p_tire uuid) returns void language plpgsql as $$
declare t public.tires; life int;
begin
  select * into t from public.tires where id = p_tire for update;
  select max(life_no) into life from public.tire_lives where tire_id = p_tire;
  if t.status <> 'estoque' then raise exception 'Só pneus em estoque vão para a recapadora'; end if;
  if not t.recappable then raise exception 'Pneu % não é recapável', t.fire_number; end if;
  if life >= t.max_lives then raise exception 'Pneu % já usou as % vidas previstas', t.fire_number, t.max_lives; end if;
  update public.tires set status = 'recapagem', location = 'Recapadora' where id = p_tire;
end $$;

create or replace function public.fn_return_from_recap(p_tire uuid, p_cost numeric, p_supplier text, p_band text, p_tread numeric) returns void language plpgsql as $$
declare life int;
begin
  select max(life_no) into life from public.tire_lives where tire_id = p_tire;
  insert into public.tire_lives (tire_id, life_no, kind, cost, supplier, band, initial_tread_mm) values (p_tire, life + 1, 'recapagem', p_cost, p_supplier, p_band, p_tread);
  update public.tires set status = 'estoque', location = 'Almoxarifado' where id = p_tire;
end $$;

create or replace function public.fn_scrap_tire(p_tire uuid, p_reason text) returns void language plpgsql as $$
begin
  update public.tires set status = 'sucata', location = null, scrap_reason = p_reason, scrapped_at = now() where id = p_tire and status in ('estoque', 'recapagem');
  if not found then raise exception 'Desmonte o pneu antes de sucatear'; end if;
end $$;

alter table public.tires add column min_stock_hint int;
create table public.tire_min_stock (client_id uuid references public.clients(id) on delete cascade, size text, min_qty int not null, primary key (client_id, size));

alter table public.dev_settings enable row level security;
alter table public.work_order_quotes enable row level security;
alter table public.work_order_comments enable row level security;
alter table public.work_order_evidences enable row level security;
alter table public.tire_min_stock enable row level security;
create policy own_quotes on public.work_order_quotes for all to anon, authenticated using (exists (select 1 from public.work_orders w where w.id = work_order_id and w.client_id = public.current_client_id()));
create policy own_comments on public.work_order_comments for all to anon, authenticated using (exists (select 1 from public.work_orders w where w.id = work_order_id and w.client_id = public.current_client_id()));
create policy own_evidences on public.work_order_evidences for all to anon, authenticated using (exists (select 1 from public.work_orders w where w.id = work_order_id and w.client_id = public.current_client_id()));
create policy own_min_stock on public.tire_min_stock for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());

-- Escalonamento "sem ação": OS crítica parada além do prazo do destinatário
create or replace function public.fn_escalate_no_action() returns int language plpgsql as $$
declare n int;
begin
  insert into public.alert_notifications (work_order_id, recipient_id, level)
  select wo.id, r.id, 'sem_acao'
  from public.work_orders wo
  join public.alert_recipients r on r.client_id = wo.client_id and r.module = 'manutencao' and r.level = 'sem_acao'
  where wo.level = 'critico' and wo.status in ('aberta', 'orcamento')
    and coalesce((select max(changed_at) from public.work_order_level_history h where h.work_order_id = wo.id), wo.created_at) < now() - make_interval(hours => r.wait_hours)
    and not exists (select 1 from public.alert_notifications n where n.work_order_id = wo.id and n.recipient_id = r.id and n.level = 'sem_acao');
  get diagnostics n = row_count;
  return n;
end $$;

-- Rotina diária completa (agende com pg_cron; o app também chama ao abrir a manutenção)
create or replace function public.fn_daily_maintenance() returns table (opened int, level_changes int, escalated int) language plpgsql as $$
declare o int; c int;
begin
  select * into o, c from public.fn_evaluate_maintenance();
  return query select o, c, public.fn_escalate_no_action();
end $$;

-- Taxa de desgaste e km estimado até a retirada (colunas novas no fim da view)
create or replace view public.v_tire_overview with (security_invoker = true) as
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
), rate as (
  select m.tire_id,
    (array_agg(m.tread_mm order by m.measured_at))[1] - (array_agg(m.tread_mm order by m.measured_at desc))[1] as mm_drop,
    max(m.km) - min(m.km) as km_span
  from public.tire_measurements m join cur on cur.tire_id = m.tire_id and cur.life_no = m.life_no
  where m.km is not null group by m.tire_id having count(*) >= 2
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
  round(least(1, greatest(0, (cur.initial_tread_mm - coalesce(lm.tread_mm, cur.initial_tread_mm)) / nullif(cur.initial_tread_mm - coalesce(s.removal_mm, 3.0), 0))), 3) as wear_ratio,
  case when r.km_span > 0 and r.mm_drop > 0 then round(r.mm_drop / (r.km_span / 1000.0), 4) end as wear_mm_per_1000km,
  case when r.km_span > 0 and r.mm_drop > 0 then greatest(0, round((coalesce(lm.tread_mm, cur.initial_tread_mm) - coalesce(s.removal_mm, 3.0)) / (r.mm_drop / (r.km_span / 1000.0)) * 1000)) end as km_to_removal
from public.tires t
join cur on cur.tire_id = t.id
join cost c on c.tire_id = t.id
left join last_meas lm on lm.tire_id = t.id
left join km on km.tire_id = t.id
left join rate r on r.tire_id = t.id
left join public.tire_settings s on s.client_id = t.client_id;

-- As rotinas de sistema rodam com o dono do banco: gravam histórico e fila de e-mails
-- (tabelas que o usuário só pode ler) e avaliam todos os clientes, como o cron faria.
alter function public.fn_evaluate_maintenance(date) security definer set search_path = public;
alter function public.fn_escalate_no_action() security definer set search_path = public;
alter function public.fn_daily_maintenance() security definer set search_path = public;
