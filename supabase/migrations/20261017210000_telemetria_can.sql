-- =====================================================================
-- Relatório de telemetria CAN: amostras e eventos importados do rastreador
-- e cálculo do relatório no banco (mesmas regras de src/lib/can.ts).
-- =====================================================================
create table public.can_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  file_name text, kind text not null check (kind in ('amostras','eventos')), rows int not null default 0,
  created_at timestamptz not null default now()
);
create table public.can_samples (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  import_id uuid references public.can_imports(id) on delete cascade,
  plate text not null, ts timestamptz not null,
  lat numeric(9,6), lng numeric(9,6),
  odo numeric, hrmt numeric, speed numeric, rpm numeric, tfl numeric, fuel_pct numeric, oil numeric, temp numeric,
  park numeric, pedal numeric, gear text, turbo numeric, volt numeric
);
create index on public.can_samples (client_id, plate, ts);
create table public.can_events (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  import_id uuid references public.can_imports(id) on delete cascade,
  plate text not null, ts timestamptz not null, code text not null, value numeric, lat numeric(9,6), lng numeric(9,6)
);
create index on public.can_events (client_id, plate, ts);
create table public.can_settings (client_id uuid primary key references public.clients(id) on delete cascade, settings jsonb not null default '{}');

-- Relatório: percorre as amostras em ordem por placa (os totalizadores precisam da última leitura válida)
create or replace function public.fn_can_report(p_from timestamptz, p_to timestamptz, p_plates text[] default null, p_cfg jsonb default '{}')
returns jsonb language plpgsql stable as $$
declare
  c_limit numeric := coalesce((p_cfg->>'speedLimit')::numeric, 80);
  c_idle numeric := coalesce((p_cfg->>'idleRpmMax')::numeric, 900);
  c_green numeric := coalesce((p_cfg->>'greenMax')::numeric, 1600);
  c_yellow numeric := coalesce((p_cfg->>'yellowMax')::numeric, 2100);
  c_coast numeric := coalesce((p_cfg->>'coastMinSpeed')::numeric, 20);
  c_kick numeric := coalesce((p_cfg->>'kickdownPedal')::numeric, 90);
  c_hot numeric := coalesce((p_cfg->>'hotTemp')::numeric, 100);
  c_idle_ep numeric := coalesce((p_cfg->>'idleEpisodeMin')::numeric, 5) * 60;
  c_deb numeric := coalesce((p_cfg->>'debounceSec')::numeric, 5);
  cid uuid := public.current_client_id();
  r record; nxt_ts timestamptz; gap numeric; dt numeric; dkm numeric; dl numeric; dd numeric; el numeric; sp numeric; on_ boolean; dkey text;
  cur text := null; v jsonb; out jsonb := '[]'::jsonb; days jsonb;
  lo numeric; lo_t timestamptz; lf numeric; lf_t timestamptz; lh numeric; lh_t timestamptz;
  km numeric; liters numeric; eng numeric; eng_hr numeric; idle_h numeric; idle_l numeric; mov numeric; maxsp numeric; over_h numeric; over_km numeric; over_ep int; over_run numeric;
  coast_h numeric; coast_km numeric; kick numeric; park_ep int; park_mov boolean; b_l numeric; b_v numeric; b_a numeric; b_r numeric; maxt numeric; hot numeric; maxtb numeric; minv numeric;
  idle_ep int; idle_run numeric; nsamp int; bad_odo int; gaps int; gap_h numeric; t_from timestamptz; t_to timestamptz; oil_const boolean;
begin
  for r in
    select s.*, lead(s.ts) over (partition by s.plate order by s.ts) as next_ts
    from public.can_samples s
    where s.client_id = cid and s.ts between p_from and p_to and (p_plates is null or s.plate = any (p_plates))
    order by s.plate, s.ts
  loop
    if cur is distinct from r.plate then
      if cur is not null then
        out := out || jsonb_build_array(public.fn_can_vehicle_json(cur, t_from, t_to, nsamp, km, liters, eng, eng_hr, idle_h, idle_l, mov, maxsp, over_h, over_km, over_ep, coast_h, coast_km, kick, park_ep, b_l, b_v, b_a, b_r, maxt, hot, maxtb, minv, idle_ep, idle_run >= c_idle_ep, days, bad_odo, gaps, gap_h, p_from, p_to, c_deb));
      end if;
      cur := r.plate; t_from := r.ts; nsamp := 0; days := '{}'::jsonb;
      lo := null; lf := null; lh := null; km := 0; liters := 0; eng := 0; eng_hr := 0; idle_h := 0; idle_l := 0; mov := 0; maxsp := 0; over_h := 0; over_km := 0; over_ep := 0; over_run := 0;
      coast_h := 0; coast_km := 0; kick := 0; park_ep := 0; park_mov := false; b_l := 0; b_v := 0; b_a := 0; b_r := 0; maxt := null; hot := 0; maxtb := null; minv := null; idle_ep := 0; idle_run := 0; bad_odo := 0; gaps := 0; gap_h := 0;
      select count(distinct oil) = 1 into oil_const from public.can_samples where client_id = cid and plate = r.plate and ts between p_from and p_to and oil is not null;
    end if;
    nsamp := nsamp + 1; t_to := r.ts;
    gap := coalesce(extract(epoch from (r.next_ts - r.ts)), 0);
    dt := case when gap > 0 and gap <= 120 then gap else 0 end;
    if gap > 600 then gaps := gaps + 1; gap_h := gap_h + gap / 3600; end if;
    dkey := to_char(r.ts at time zone 'America/Recife', 'YYYY-MM-DD');
    dkm := 0; dl := 0;
    if r.odo is not null then
      if lo is null then lo := r.odo; lo_t := r.ts;
      else dd := r.odo - lo; el := greatest(1, extract(epoch from (r.ts - lo_t)));
        if dd >= 0 and dd <= greatest(200, el * 45) then dkm := dd / 1000; lo := r.odo; lo_t := r.ts; else bad_odo := bad_odo + 1; end if;
      end if;
    end if;
    if r.tfl is not null then
      if lf is null then lf := r.tfl; lf_t := r.ts;
      else dd := r.tfl - lf; el := greatest(1, extract(epoch from (r.ts - lf_t)));
        if dd >= 0 and dd <= greatest(10, el / 60 * 15) then dl := dd / 10; lf := r.tfl; lf_t := r.ts; end if;
      end if;
    end if;
    if r.hrmt is not null then
      if lh is null then lh := r.hrmt; lh_t := r.ts;
      else dd := r.hrmt - lh; el := greatest(1, extract(epoch from (r.ts - lh_t)));
        if dd >= 0 and dd <= greatest(5, el / 60 * 2) then eng_hr := eng_hr + dd / 60; lh := r.hrmt; lh_t := r.ts; end if;
      end if;
    end if;
    km := km + dkm; liters := liters + dl;
    on_ := coalesce(r.rpm, 0) > 300; sp := coalesce(r.speed, 0);
    days := jsonb_set(days, array[dkey], jsonb_build_object(
      'day', dkey,
      'km', coalesce((days->dkey->>'km')::numeric, 0) + dkm, 'liters', coalesce((days->dkey->>'liters')::numeric, 0) + dl,
      'engineH', coalesce((days->dkey->>'engineH')::numeric, 0) + case when on_ then dt / 3600 else 0 end,
      'idleH', coalesce((days->dkey->>'idleH')::numeric, 0) + case when on_ and sp = 0 then dt / 3600 else 0 end,
      'idleL', coalesce((days->dkey->>'idleL')::numeric, 0) + case when on_ and sp = 0 then dl else 0 end,
      'movingH', coalesce((days->dkey->>'movingH')::numeric, 0) + case when sp > 0 then dt / 3600 else 0 end));
    if on_ then
      eng := eng + dt / 3600;
      if r.rpm <= c_idle then b_l := b_l + dt / 3600; elsif r.rpm <= c_green then b_v := b_v + dt / 3600; elsif r.rpm <= c_yellow then b_a := b_a + dt / 3600; else b_r := b_r + dt / 3600; end if;
    end if;
    if on_ and sp = 0 then idle_h := idle_h + dt / 3600; idle_l := idle_l + dl; idle_run := idle_run + dt;
    else if idle_run >= c_idle_ep then idle_ep := idle_ep + 1; end if; idle_run := 0; end if;
    if sp > 0 then mov := mov + dt / 3600; end if;
    maxsp := greatest(maxsp, sp);
    if sp > c_limit then over_h := over_h + dt / 3600; over_km := over_km + dkm; if over_run < 10 and over_run + dt >= 10 then over_ep := over_ep + 1; end if; over_run := over_run + dt; else over_run := 0; end if;
    if r.gear = 'N' and sp >= c_coast then coast_h := coast_h + dt / 3600; coast_km := coast_km + dkm; end if;
    if coalesce(r.pedal, 0) >= c_kick then kick := kick + dt / 3600; end if;
    if r.park = 1 and sp > 5 then if not park_mov then park_ep := park_ep + 1; end if; park_mov := true; else park_mov := false; end if;
    if r.temp is not null then maxt := greatest(coalesce(maxt, -99), r.temp); if r.temp > c_hot then hot := hot + dt / 3600; end if; end if;
    if r.turbo is not null then maxtb := greatest(coalesce(maxtb, 0), r.turbo); end if;
    if r.volt is not null and on_ and r.volt > 5 then minv := least(coalesce(minv, 99), r.volt); end if;
  end loop;
  if cur is not null then
    out := out || jsonb_build_array(public.fn_can_vehicle_json(cur, t_from, t_to, nsamp, km, liters, eng, eng_hr, idle_h, idle_l, mov, maxsp, over_h, over_km, over_ep, coast_h, coast_km, kick, park_ep, b_l, b_v, b_a, b_r, maxt, hot, maxtb, minv, idle_ep, idle_run >= c_idle_ep, days, bad_odo, gaps, gap_h, p_from, p_to, c_deb));
  end if;
  return jsonb_build_object('from', p_from, 'to', p_to, 'vehicles', out);
end $$;

-- Monta o objeto de um veículo e soma os eventos do rastreador (sem repetição dentro de debounce)
create or replace function public.fn_can_vehicle_json(p_plate text, t_from timestamptz, t_to timestamptz, nsamp int, km numeric, liters numeric, eng numeric, eng_hr numeric, idle_h numeric, idle_l numeric, mov numeric, maxsp numeric,
  over_h numeric, over_km numeric, over_ep int, coast_h numeric, coast_km numeric, kick numeric, park_ep int, b_l numeric, b_v numeric, b_a numeric, b_r numeric, maxt numeric, hot numeric, maxtb numeric, minv numeric,
  idle_ep int, idle_open boolean, days jsonb, bad_odo int, gaps int, gap_h numeric, p_from timestamptz, p_to timestamptz, c_deb numeric)
returns jsonb language sql stable as $$
  with ev as (
    select code, ts, lag(ts) over (partition by code order by ts) as prev_ts from public.can_events
    where client_id = public.current_client_id() and plate = p_plate and ts between p_from and p_to
  ), evd as (select code, ts from ev where prev_ts is null or ts - prev_ts >= make_interval(secs => c_deb)),
  evc as (select coalesce(jsonb_object_agg(code, n), '{}'::jsonb) as j, coalesce(sum(n) filter (where code not like '%\_OUT'), 0) as total from (select code, count(*) n from evd group by code) x)
  select jsonb_build_object('plate', p_plate, 'from', t_from, 'to', t_to, 'samples', nsamp, 'km', km, 'liters', liters,
    'kmL', case when liters > 0 then km / liters end, 'lph', case when eng > 0 then liters / eng end,
    'engineH', eng, 'engineHByHrmt', eng_hr, 'idleH', idle_h, 'idleL', idle_l, 'idlePct', case when eng > 0 then idle_h / eng end,
    'movingH', mov, 'avgSpeed', case when mov > 0 then km / mov end, 'maxSpeed', maxsp, 'overH', over_h, 'overKm', over_km, 'overEpisodes', over_ep,
    'coastH', coast_h, 'coastKm', coast_km, 'kickdownH', kick, 'parkMovingEpisodes', park_ep,
    'rpmBands', jsonb_build_object('lenta', b_l, 'verde', b_v, 'amarela', b_a, 'vermelha', b_r), 'maxTemp', maxt, 'hotH', hot, 'maxTurbo', maxtb, 'minVolt', minv,
    'idleEpisodes', idle_ep + case when idle_open then 1 else 0 end,
    'days', (select coalesce(jsonb_agg(d.value || jsonb_build_object('events', (select count(*) from evd where to_char(evd.ts at time zone 'America/Recife', 'YYYY-MM-DD') = d.key)) order by d.key), '[]'::jsonb) from jsonb_each(days) d),
    'events', evc.j, 'eventsPer100', case when km > 0 then evc.total / km * 100 end,
    'quality', jsonb_build_object('gaps', gaps, 'gapH', gap_h, 'badOdo', bad_odo))
  from evc
$$;

alter table public.can_imports enable row level security;
alter table public.can_samples enable row level security;
alter table public.can_events enable row level security;
alter table public.can_settings enable row level security;
create policy own_can_imports on public.can_imports for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_can_samples on public.can_samples for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_can_events on public.can_events for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_can_settings on public.can_settings for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());

-- resumo dos dados importados (placas e período)
create or replace function public.fn_can_summary() returns table (plates text[], ts_from timestamptz, ts_to timestamptz, samples bigint, events bigint) language sql stable as $$
  select array_agg(distinct plate order by plate), min(ts), max(ts), count(*), (select count(*) from public.can_events where client_id = public.current_client_id())
  from public.can_samples where client_id = public.current_client_id()
$$;
