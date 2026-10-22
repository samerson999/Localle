-- =====================================================================
-- Fase 1, item 6: instalação/vinculação do rastreador
-- =====================================================================
create table public.tracker_installations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  imei text not null,
  tracker_model text,
  installed_at timestamptz not null default now(),
  technician text not null,
  initial_km numeric(12,1),
  photo text,                              -- foto do painel (data URL no estudo; Storage em produção)
  km_calculated boolean not null default false,
  check (km_calculated or (initial_km is not null and photo is not null))
);
alter table public.assets add column odometer_check_done boolean not null default true;

create or replace function public.fn_install_tracker(p_asset uuid, p_imei text, p_model text, p_initial_km numeric, p_photo text, p_technician text, p_km_calculated boolean, p_installed_at timestamptz default now())
returns uuid language plpgsql as $$
declare cid uuid; iid uuid;
begin
  select client_id into cid from public.assets where id = p_asset;
  if cid is null then raise exception 'Ativo não encontrado'; end if;
  if nullif(trim(p_technician), '') is null then raise exception 'Informe o técnico responsável'; end if;
  if not p_km_calculated and (p_initial_km is null or nullif(p_photo, '') is null) then raise exception 'Odômetro inicial e foto do painel são obrigatórios'; end if;
  insert into public.tracker_installations (client_id, asset_id, imei, tracker_model, installed_at, technician, initial_km, photo, km_calculated)
  values (cid, p_asset, p_imei, p_model, p_installed_at, p_technician, p_initial_km, p_photo, p_km_calculated) returning id into iid;
  update public.assets set km_calculated = p_km_calculated, odometer_check_done = false,
    km_mode = case when p_km_calculated then 'rastreador'::public.km_mode else km_mode end where id = p_asset;
  if p_initial_km is not null then
    insert into public.odometer_readings (client_id, asset_id, km, read_at, source, source_ref, recorded_by, photo_url, is_calculated)
    values (cid, p_asset, p_initial_km, p_installed_at, 'instalacao', iid, p_technician, p_photo, false);
  end if;
  return iid;
end $$;

-- Primeiro lançamento manual após a instalação: devolve a divergência (o app pergunta uma vez)
create or replace function public.fn_check_odometer(p_asset uuid, p_km numeric) returns jsonb language plpgsql as $$
declare a public.assets; cur numeric;
begin
  select * into a from public.assets where id = p_asset;
  if a.odometer_check_done then return jsonb_build_object('ask', false); end if;
  select km into cur from public.v_asset_km where asset_id = p_asset;
  update public.assets set odometer_check_done = true where id = p_asset;
  return jsonb_build_object('ask', cur is not null and abs(p_km - cur) > greatest(500, cur * 0.03), 'expected', cur, 'informed', p_km);
end $$;

alter table public.tracker_installations enable row level security;
create policy own_installations on public.tracker_installations for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
