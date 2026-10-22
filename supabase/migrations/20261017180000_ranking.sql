-- =====================================================================
-- Fase 1, item 5: ranking de motoristas — matriz de eventos × pesos por
-- faixa, limite de pontos por período e eventos de telemetria/CAN.
-- =====================================================================

create table public.event_types (
  client_id uuid not null references public.clients(id) on delete cascade,
  code text not null,
  label text not null,
  category text not null default 'basico' check (category in ('basico','telemetria','videotelemetria','jornada','empresa')),
  weight numeric(8,2) not null default 1,           -- pontos por ocorrência
  tiers jsonb not null default '[]',                -- faixas: [{"min": 90, "weight": 5}] usa o peso da maior faixa atingida pelo valor
  unit text,                                        -- unidade do valor (km/h, rpm, min)
  requires_can boolean not null default false,
  active boolean not null default true,
  primary key (client_id, code)
);

create table public.ranking_settings (
  client_id uuid primary key references public.clients(id) on delete cascade,
  points_limit numeric(10,2) not null default 100,
  limit_period text not null default 'mes' check (limit_period in ('semana','mes','trimestre'))
);

alter table public.assets add column driver_person_id uuid references public.people(id) on delete set null;
alter table public.assets add column has_can boolean not null default false;

create table public.driver_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  local_ref text,
  person_id uuid references public.people(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  code text not null,
  occurred_at timestamptz not null,
  value numeric,
  source text not null default 'rastreador' check (source in ('rastreador','can','regra','jornada','manual')),
  lat numeric(9,6), lng numeric(9,6)
);
create unique index driver_events_ref on public.driver_events (client_id, local_ref);
create index on public.driver_events (person_id, occurred_at);

-- Matriz padrão de eventos (o cliente edita depois)
create or replace function public.fn_default_event_types(p_client uuid) returns void language sql as $$
  insert into public.event_types (client_id, code, label, category, weight, tiers, unit, requires_can) values
    (p_client, 'excesso_velocidade', 'Excesso de velocidade', 'basico', 3, '[{"min": 90, "weight": 5}, {"min": 100, "weight": 10}]', 'km/h', false),
    (p_client, 'aceleracao_brusca', 'Aceleração brusca', 'basico', 2, '[]', null, false),
    (p_client, 'frenagem_brusca', 'Frenagem brusca', 'basico', 3, '[]', null, false),
    (p_client, 'curva_brusca', 'Curva brusca', 'basico', 2, '[]', null, false),
    (p_client, 'ociosidade', 'Tempo ocioso (motor ligado parado)', 'telemetria', 1, '[{"min": 10, "weight": 2}, {"min": 20, "weight": 4}]', 'min', false),
    (p_client, 'rpm_excessivo', 'RPM excessivo', 'telemetria', 2, '[{"min": 2800, "weight": 4}]', 'rpm', true),
    (p_client, 'banguela', 'Banguela (ponto morto em movimento)', 'telemetria', 5, '[]', 'km/h', true),
    (p_client, 'sem_cinto', 'Sem cinto de segurança', 'videotelemetria', 4, '[]', null, false),
    (p_client, 'celular', 'Uso de celular', 'videotelemetria', 6, '[]', null, false),
    (p_client, 'fadiga', 'Fadiga / bocejo', 'videotelemetria', 6, '[]', null, false),
    (p_client, 'violacao_jornada', 'Violação de jornada', 'jornada', 4, '[]', null, false),
    (p_client, 'fora_horario', 'Rodou fora do horário (regra da empresa)', 'empresa', 3, '[]', null, false)
  on conflict do nothing;
  insert into public.ranking_settings (client_id) values (p_client) on conflict do nothing;
$$;
select public.fn_default_event_types(id) from public.clients;

-- Pontos de um evento: peso da maior faixa atingida pelo valor, senão o peso base
create or replace function public.fn_event_points(p_tiers jsonb, p_weight numeric, p_value numeric) returns numeric
language sql immutable as $$
  select coalesce((select (t ->> 'weight')::numeric from jsonb_array_elements(p_tiers) t
                    where p_value is not null and p_value >= (t ->> 'min')::numeric order by (t ->> 'min')::numeric desc limit 1), p_weight)
$$;

create or replace function public.fn_driver_ranking(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable as $$
declare v_to timestamptz := least(p_to, now()); v_days numeric; s public.ranking_settings; v_pdays numeric; v_limit numeric; r jsonb;
begin
  select * into s from public.ranking_settings where client_id = public.current_client_id();
  v_days := greatest(1, extract(epoch from (v_to - p_from)) / 86400.0);
  v_pdays := case coalesce(s.limit_period, 'mes') when 'semana' then 7 when 'trimestre' then 91 else 30 end;
  v_limit := round(coalesce(s.points_limit, 100) * v_days / v_pdays, 1);
  with ev as (
    select e.person_id, e.code, et.label, et.category, public.fn_event_points(et.tiers, et.weight, e.value) as pts
    from public.driver_events e join public.event_types et on et.client_id = e.client_id and et.code = e.code and et.active
    where e.occurred_at between p_from and v_to and e.person_id is not null
  ),
  per as (
    select p.id, p.name,
      coalesce(sum(ev.pts), 0) as points, count(ev.code) as events,
      (select coalesce(sum(k.km), 0) from (select max(o.km) - min(o.km) as km from public.odometer_readings o join public.assets a on a.id = o.asset_id
          where a.driver_person_id = p.id and o.read_at between p_from and v_to group by o.asset_id) k) as km
    from public.people p left join ev on ev.person_id = p.id
    where p.role = 'motorista' and p.active group by p.id, p.name
  )
  select jsonb_build_object(
    'limit', coalesce(s.points_limit, 100), 'limit_period', coalesce(s.limit_period, 'mes'), 'limit_scaled', v_limit, 'days', round(v_days, 1),
    'drivers', coalesce((select jsonb_agg(x order by (x->>'points')::numeric, x->>'name') from (
      select jsonb_build_object('person_id', per.id, 'name', per.name, 'points', per.points, 'events', per.events, 'km', per.km,
        'points_per_100km', case when per.km > 0 then round(per.points / (per.km / 100.0), 2) end,
        'attention', per.points > v_limit,
        'by_code', coalesce((select jsonb_agg(jsonb_build_object('code', b.code, 'label', b.label, 'category', b.category, 'qty', b.qty, 'points', b.pts) order by b.pts desc)
            from (select code, label, category, count(*) as qty, sum(pts) as pts from ev where ev.person_id = per.id group by code, label, category) b), '[]'::jsonb)) as x
      from per) q), '[]'::jsonb)
  ) into r;
  return r;
end $$;

alter table public.event_types enable row level security;
alter table public.ranking_settings enable row level security;
alter table public.driver_events enable row level security;
create policy own_event_types on public.event_types for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_ranking_settings on public.ranking_settings for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_driver_events on public.driver_events for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
