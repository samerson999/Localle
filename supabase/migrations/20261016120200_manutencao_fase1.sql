-- =====================================================================
-- Fase 1, item 1: planos preventivos, OS com níveis (pendente/alerta/crítico),
-- histórico de níveis e destinatários de alerta por nível.
-- =====================================================================

create type public.plan_trigger as enum ('km','dias','ambos');
create type public.wo_level as enum ('pendente','alerta','critico');
create type public.wo_status as enum ('aberta','orcamento','aprovada','execucao','concluida','cancelada');

create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  service_code text not null,                 -- ex.: oleo_motor; corretivas com o mesmo serviço recalculam o plano
  trigger public.plan_trigger not null,
  km_interval numeric(10,1), days_interval int,
  km_advance numeric(10,1) not null default 0, days_advance int not null default 0,
  critical_after_days int not null default 10, critical_after_km numeric(10,1),
  active boolean not null default true,
  check (trigger = 'dias' or km_interval > 0),
  check (trigger = 'km' or days_interval > 0)
);

create table public.maintenance_plan_assets (
  plan_id uuid not null references public.maintenance_plans(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  baseline_km numeric(12,1) not null default 0,   -- referência quando ainda não há OS executada
  baseline_date date not null default current_date,
  primary key (plan_id, asset_id)
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  number bigint generated always as identity,
  asset_id uuid not null references public.assets(id) on delete cascade,
  plan_id uuid references public.maintenance_plans(id) on delete set null,
  type text not null check (type in ('preventiva','corretiva')),
  service_codes text[] not null default '{}',
  title text not null,
  status public.wo_status not null default 'aberta',
  level public.wo_level,                       -- só para preventivas geradas por plano
  unplanned boolean not null default false,
  trigger_km numeric(12,1), trigger_date date,  -- quando a janela de antecedência abriu
  due_km numeric(12,1), due_date date,          -- vencimento do plano
  odometer_at numeric(12,1),                    -- km na execução
  created_at timestamptz not null default now(),
  shop_in_at timestamptz, executed_at timestamptz,
  cost numeric(12,2)
);
create index on public.work_orders (asset_id, status);
create unique index one_open_wo_per_plan on public.work_orders (plan_id, asset_id) where status not in ('concluida','cancelada') and plan_id is not null;

-- tempo entre gatilho e execução (requisito do item 1)
create view public.v_work_order_lead_time with (security_invoker = true) as
select id, client_id, asset_id, plan_id, created_at, executed_at,
  extract(epoch from (executed_at - created_at)) / 86400.0 as days_trigger_to_execution
from public.work_orders where plan_id is not null and executed_at is not null;

create table public.work_order_level_history (
  id bigint generated always as identity primary key,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  level public.wo_level not null,
  changed_at timestamptz not null default now()
);

create table public.alert_recipients (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  module text not null default 'manutencao',
  level text not null check (level in ('alerta','critico','sem_acao')),
  name text not null, email text not null,
  wait_hours int not null default 0            -- para 'sem_acao': escala se ninguém agir em X horas
);

create table public.alert_notifications (
  id bigint generated always as identity primary key,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  recipient_id uuid references public.alert_recipients(id) on delete set null,
  level text not null,
  created_at timestamptz not null default now(),
  status text not null default 'na_fila' check (status in ('na_fila','enviado','erro'))
);

-- Avalia todos os planos: abre OS dentro da janela e atualiza níveis. Rodar 1x por dia.
create or replace function public.fn_evaluate_maintenance(p_today date default current_date) returns table (opened int, level_changes int)
language plpgsql as $$
declare r record; v_last_km numeric; v_last_date date; v_due_km numeric; v_due_date date; v_cur numeric;
        v_open boolean; v_opened int := 0; v_changes int := 0; v_new public.wo_level; w record;
begin
  for r in select p.*, pa.asset_id, pa.baseline_km, pa.baseline_date, a.client_id as a_client
           from public.maintenance_plans p join public.maintenance_plan_assets pa on pa.plan_id = p.id join public.assets a on a.id = pa.asset_id
           where p.active loop
    -- última execução do serviço (preventiva OU corretiva) recalcula o plano
    select wo.odometer_at, wo.executed_at::date into v_last_km, v_last_date
      from public.work_orders wo
     where wo.asset_id = r.asset_id and wo.status = 'concluida' and r.service_code = any (wo.service_codes)
     order by wo.executed_at desc limit 1;
    v_last_km := coalesce(v_last_km, r.baseline_km);
    v_last_date := coalesce(v_last_date, r.baseline_date);
    v_due_km := case when r.trigger <> 'dias' then v_last_km + r.km_interval end;
    v_due_date := case when r.trigger <> 'km' then v_last_date + r.days_interval end;
    select km into v_cur from public.v_asset_km where asset_id = r.asset_id;
    v_open := (v_due_km is not null and v_cur >= v_due_km - r.km_advance)
           or (v_due_date is not null and p_today >= v_due_date - r.days_advance);
    if v_open and not exists (select 1 from public.work_orders where plan_id = r.id and asset_id = r.asset_id and status not in ('concluida','cancelada')) then
      insert into public.work_orders (client_id, asset_id, plan_id, type, service_codes, title, level, trigger_km, trigger_date, due_km, due_date)
      values (r.a_client, r.asset_id, r.id, 'preventiva', array[r.service_code], r.name, 'pendente', v_cur, p_today, v_due_km, v_due_date);
      v_opened := v_opened + 1;
    end if;
  end loop;

  -- níveis: pendente → alerta (venceu) → crítico (X dias/km após vencer)
  for w in select wo.*, p.critical_after_days, p.critical_after_km, ak.km as cur_km
             from public.work_orders wo join public.maintenance_plans p on p.id = wo.plan_id
             left join public.v_asset_km ak on ak.asset_id = wo.asset_id
            where wo.status not in ('concluida','cancelada') loop
    v_new := 'pendente';
    if (w.due_km is not null and w.cur_km >= w.due_km) or (w.due_date is not null and p_today >= w.due_date) then v_new := 'alerta'; end if;
    if (w.due_date is not null and p_today >= w.due_date + w.critical_after_days)
       or (w.due_km is not null and w.critical_after_km is not null and w.cur_km >= w.due_km + w.critical_after_km) then v_new := 'critico'; end if;
    if w.level is distinct from v_new then
      update public.work_orders set level = v_new where id = w.id;
      insert into public.work_order_level_history (work_order_id, level) values (w.id, v_new);
      insert into public.alert_notifications (work_order_id, recipient_id, level)
        select w.id, ar.id, v_new::text from public.alert_recipients ar where ar.client_id = w.client_id and ar.module = 'manutencao' and ar.level = v_new::text;
      v_changes := v_changes + 1;
    end if;
  end loop;
  return query select v_opened, v_changes;
end $$;

-- Agendamento diário (Supabase tem pg_cron). Descomente após `supabase start`:
-- create extension if not exists pg_cron;
-- select cron.schedule('avaliar-manutencao', '0 6 * * *', $$select public.fn_evaluate_maintenance()$$);

alter table public.maintenance_plans enable row level security;
alter table public.maintenance_plan_assets enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_level_history enable row level security;
alter table public.alert_recipients enable row level security;
alter table public.alert_notifications enable row level security;
create policy own_plans on public.maintenance_plans for all to authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_plan_assets on public.maintenance_plan_assets for all to authenticated using (exists (select 1 from public.maintenance_plans p where p.id = plan_id and p.client_id = public.current_client_id()));
create policy own_wo on public.work_orders for all to authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_wo_hist on public.work_order_level_history for select to authenticated using (exists (select 1 from public.work_orders w where w.id = work_order_id and w.client_id = public.current_client_id()));
create policy own_recipients on public.alert_recipients for all to authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_notifications on public.alert_notifications for select to authenticated using (exists (select 1 from public.work_orders w where w.id = work_order_id and w.client_id = public.current_client_id()));
