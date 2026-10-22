-- =====================================================================
-- Fase 1, item 7: Painel da Locale — acessos por rastreadora, histórico,
-- prévia de fatura e dois modelos de cobrança (por rastreador / pacote mínimo).
-- =====================================================================
create table public.tenant_billing (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  model text not null default 'por_rastreador' check (model in ('por_rastreador','pacote_minimo')),
  price numeric(10,2) not null default 2,
  min_accesses int not null default 100,
  extra_price numeric(10,2) not null default 2,
  basis text not null default 'ativos' check (basis in ('ativos','novos'))
);
create table public.tracker_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  asset_name text, client_name text,
  imei text not null,
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz
);
create index on public.tracker_links (tenant_id, linked_at);
create table public.tracker_stock (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  imei text not null unique, model text, created_at timestamptz not null default now()
);

-- toda instalação gera o vínculo (e encerra o anterior do mesmo veículo)
create or replace function public.tg_install_link() returns trigger language plpgsql security definer set search_path = public as $$
declare t uuid; a public.assets;
begin
  select c.tenant_id into t from public.clients c where c.id = new.client_id;
  select * into a from public.assets where id = new.asset_id;
  update public.tracker_links set unlinked_at = new.installed_at where asset_id = new.asset_id and unlinked_at is null;
  insert into public.tracker_links (tenant_id, client_id, asset_id, asset_name, client_name, imei, linked_at)
  values (t, new.client_id, new.asset_id, a.name, (select name from public.clients where id = new.client_id), new.imei, new.installed_at);
  delete from public.tracker_stock where imei = new.imei;
  return new;
end $$;
create trigger install_link after insert on public.tracker_installations for each row execute function public.tg_install_link();

-- quem é administrador da plataforma (claim no login; no estudo local, a chave anon com dev_settings)
alter table public.dev_settings add column platform_admin_dev boolean not null default true;
create or replace function public.fn_is_platform_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'platform_admin')::boolean, false)
      or (coalesce(auth.jwt() ->> 'role', 'anon') = 'anon' and coalesce((select platform_admin_dev from public.dev_settings where id = 1), false))
$$;

create or replace function public.fn_invoice_total(n int, model text, price numeric, min_acc int, extra numeric) returns numeric language sql immutable as $$
  select case when model = 'pacote_minimo' then min_acc * price + greatest(0, n - min_acc) * extra else n * price end
$$;

create or replace function public.fn_platform_billing(p_months int default 12) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.fn_is_platform_admin() then raise exception 'Acesso restrito ao administrador da plataforma'; end if;
  with months as (
    select to_char(m, 'YYYY-MM') as ym, m as ms, (m + interval '1 month' - interval '1 second') as me
    from generate_series(date_trunc('month', now()) - make_interval(months => p_months - 1), date_trunc('month', now()), interval '1 month') m
  ), cfg as (
    select t.id, t.name, coalesce(b.model, 'por_rastreador') model, coalesce(b.price, 2) price, coalesce(b.min_accesses, 100) min_acc, coalesce(b.extra_price, 2) extra, coalesce(b.basis, 'ativos') basis
    from public.tenants t left join public.tenant_billing b on b.tenant_id = t.id
  ), per as (
    select c.id, mo.ym,
      count(*) filter (where l.linked_at <= mo.me and (l.unlinked_at is null or l.unlinked_at >= mo.ms)) as active,
      count(*) filter (where l.linked_at between mo.ms and mo.me) as fresh
    from cfg c cross join months mo left join public.tracker_links l on l.tenant_id = c.id
    group by c.id, mo.ym
  )
  select jsonb_build_object('months', (select jsonb_agg(ym order by ym) from months), 'tenants', coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'billing', jsonb_build_object('model', c.model, 'price', c.price, 'min', c.min_acc, 'extraPrice', c.extra, 'basis', c.basis),
    'clients', (select count(*) from public.clients cl where cl.tenant_id = c.id),
    'vehiclesIdle', (select count(*) from public.assets a join public.clients cl on cl.id = a.client_id where cl.tenant_id = c.id and a.kind = 'veiculo'
                      and not exists (select 1 from public.tracker_links l where l.asset_id = a.id and l.unlinked_at is null)),
    'stock', (select count(*) from public.tracker_stock s where s.tenant_id = c.id),
    'history', (select jsonb_agg(jsonb_build_object('ym', p.ym, 'active', p.active, 'fresh', p.fresh,
        'accesses', case when c.basis = 'novos' then p.fresh else p.active end,
        'total', public.fn_invoice_total((case when c.basis = 'novos' then p.fresh else p.active end)::int, c.model, c.price, c.min_acc, c.extra),
        'totalOther', public.fn_invoice_total((case when c.basis = 'novos' then p.fresh else p.active end)::int, case when c.model = 'pacote_minimo' then 'por_rastreador' else 'pacote_minimo' end, c.price, c.min_acc, c.extra)) order by p.ym)
      from per p where p.id = c.id)) order by c.name), '[]'::jsonb)) into r
  from cfg c;
  return r;
end $$;

-- rastreadores cobrados de uma rastreadora num mês (detalhe da fatura)
create or replace function public.fn_tenant_billed_links(p_tenant uuid, p_ym text) returns table (imei text, asset_name text, client_name text, linked_at timestamptz, unlinked_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare ms timestamptz := to_date(p_ym || '-01', 'YYYY-MM-DD'); me timestamptz := ms + interval '1 month' - interval '1 second'; b text;
begin
  if not public.fn_is_platform_admin() then raise exception 'Acesso restrito ao administrador da plataforma'; end if;
  select coalesce(basis, 'ativos') into b from public.tenant_billing where tenant_id = p_tenant;
  return query select l.imei, l.asset_name, l.client_name, l.linked_at, l.unlinked_at from public.tracker_links l
    where l.tenant_id = p_tenant and case when coalesce(b, 'ativos') = 'novos' then l.linked_at between ms and me else l.linked_at <= me and (l.unlinked_at is null or l.unlinked_at >= ms) end
    order by l.linked_at;
end $$;

create or replace function public.fn_set_tenant_billing(p_tenant uuid, p_model text, p_price numeric, p_min int, p_extra numeric, p_basis text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.fn_is_platform_admin() then raise exception 'Acesso restrito ao administrador da plataforma'; end if;
  insert into public.tenant_billing values (p_tenant, p_model, p_price, p_min, p_extra, p_basis)
  on conflict (tenant_id) do update set model = excluded.model, price = excluded.price, min_accesses = excluded.min_accesses, extra_price = excluded.extra_price, basis = excluded.basis;
end $$;

alter table public.tenant_billing enable row level security;
alter table public.tracker_links enable row level security;
alter table public.tracker_stock enable row level security;
-- a rastreadora enxerga os próprios vínculos e estoque (via cliente do contexto)
create policy own_links on public.tracker_links for select to anon, authenticated using (client_id = public.current_client_id());
create policy own_stock on public.tracker_stock for all to anon, authenticated using (tenant_id = (select tenant_id from public.clients where id = public.current_client_id())) with check (tenant_id = (select tenant_id from public.clients where id = public.current_client_id()));
create policy own_billing on public.tenant_billing for select to anon, authenticated using (tenant_id = (select tenant_id from public.clients where id = public.current_client_id()));

-- importação dos vínculos já existentes na simulação (só para o cliente do contexto)
create or replace function public.fn_import_links(p_links jsonb) returns int language plpgsql security definer set search_path = public as $$
declare cid uuid := public.current_client_id(); t uuid; n int;
begin
  select tenant_id into t from public.clients where id = cid;
  if t is null then raise exception 'Sem cliente no contexto'; end if;
  if exists (select 1 from public.tracker_links where client_id = cid) then return 0; end if;
  insert into public.tracker_links (tenant_id, client_id, asset_id, asset_name, client_name, imei, linked_at, unlinked_at)
  select t, cid, (x->>'asset_id')::uuid, x->>'asset_name', (select name from public.clients where id = cid), x->>'imei', (x->>'linked_at')::timestamptz, (x->>'unlinked_at')::timestamptz
  from jsonb_array_elements(p_links) x;
  get diagnostics n = row_count;
  return n;
end $$;
