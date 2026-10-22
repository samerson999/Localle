-- =====================================================================
-- Fase 1, item 3: checklist com grupos de respondentes, novos tipos de
-- resposta, carimbo de data/hora no servidor e BI calculado no banco.
-- =====================================================================

-- Pessoas que respondem (motoristas e demais funções)
create table public.people (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  local_ref text,
  name text not null,
  role text not null default 'motorista',          -- motorista, chefe_patio, porteiro, mecanico, outro
  cnh_category text,
  active boolean not null default true
);
create unique index people_local_ref on public.people (client_id, local_ref);

-- Grupo = regra (categorias de CNH e/ou função) + membros avulsos
create table public.respondent_groups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  rule_cnh text[] not null default '{}',             -- ex.: {D,E} = motoristas com CNH D ou E
  rule_roles text[] not null default '{}'            -- ex.: {chefe_patio}
);
create table public.respondent_group_members (
  group_id uuid not null references public.respondent_groups(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  primary key (group_id, person_id)
);
create view public.v_group_members with (security_invoker = true) as
select g.id as group_id, p.id as person_id
from public.respondent_groups g join public.people p on p.client_id = g.client_id and p.active
where p.cnh_category = any (g.rule_cnh) or p.role = any (g.rule_roles)
   or exists (select 1 from public.respondent_group_members m where m.group_id = g.id and m.person_id = p.id);

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  local_ref text,
  name text not null,
  active boolean not null default true,
  schedule_type text not null check (schedule_type in ('diario','semanal','mensal','ciclo','datas')),
  weekday int check (weekday between 0 and 6),
  month_day int check (month_day between 1 and 28),
  cycle_days int check (cycle_days > 0),
  start_date date not null default current_date,
  dates date[] not null default '{}',
  include_sundays boolean not null default false
);
create table public.checklist_template_targets (
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  group_id uuid references public.respondent_groups(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  check ((group_id is null) <> (person_id is null))
);
create table public.checklist_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  local_ref text,
  position int not null default 0,
  label text not null,
  type text not null check (type in ('texto','sim_nao','nota','km','data','datahora','foto','multipla')),
  options text[] not null default '{}',
  required boolean not null default true,
  require_photo boolean not null default false,
  scale_max int not null default 5,                  -- nota de 1 a scale_max
  flag_values text[] not null default '{}',          -- respostas que indicam problema (ex.: Não, Ruim)
  flag_below int                                     -- nota menor ou igual a este valor indica problema
);

create table public.checklist_responses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  local_ref text,
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);
create index on public.checklist_responses (template_id, person_id, finished_at);
create table public.checklist_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.checklist_responses(id) on delete cascade,
  question_id uuid not null references public.checklist_questions(id) on delete cascade,
  value text,
  num_value numeric,
  photo text,
  flagged boolean not null default false
);
create index on public.checklist_answers (question_id);

-- Envio do checklist em uma transação: valida obrigatórias e fotos, carimba data/hora,
-- marca respostas com problema e registra o km no histórico de odômetro.
create or replace function public.fn_submit_checklist(p_template uuid, p_person uuid, p_asset uuid, p_started_at timestamptz, p_answers jsonb)
returns uuid language plpgsql as $$
declare q record; a jsonb; rid uuid; v text; n numeric; flag boolean; cid uuid;
begin
  select client_id into cid from public.checklist_templates where id = p_template and active;
  if cid is null then raise exception 'Checklist inativo ou inexistente'; end if;
  insert into public.checklist_responses (client_id, template_id, person_id, asset_id, started_at) values (cid, p_template, p_person, p_asset, p_started_at) returning id into rid;
  for q in select * from public.checklist_questions where template_id = p_template order by position loop
    a := p_answers -> q.id::text;
    v := nullif(trim(coalesce(a ->> 'value', '')), '');
    if q.type = 'datahora' then v := to_char(now() at time zone 'America/Recife', 'YYYY-MM-DD"T"HH24:MI'); end if; -- carimbo do servidor
    if q.required and v is null and q.type <> 'foto' then raise exception 'Responda: "%"', q.label; end if;
    if (q.type = 'foto' or q.require_photo) and q.required and nullif(a ->> 'photo', '') is null then raise exception 'Envie a foto de "%"', q.label; end if;
    n := case when q.type in ('km','nota') and v ~ '^[0-9]+([.,][0-9]+)?$' then replace(v, ',', '.')::numeric end;
    if q.type = 'nota' and n is not null and (n < 1 or n > q.scale_max) then raise exception 'A nota de "%" vai de 1 a %', q.label, q.scale_max; end if;
    flag := (v = any (q.flag_values)) or (q.type = 'nota' and q.flag_below is not null and n <= q.flag_below);
    if v is not null or nullif(a ->> 'photo', '') is not null then
      insert into public.checklist_answers (response_id, question_id, value, num_value, photo, flagged) values (rid, q.id, v, n, nullif(a ->> 'photo', ''), coalesce(flag, false));
    end if;
    if q.type = 'km' and n is not null and p_asset is not null then
      perform public.fn_register_odometer(p_asset, n, 'checklist', rid, (select name from public.people where id = p_person));
    end if;
  end loop;
  return rid;
end $$;

-- Datas em que o checklist deveria ser feito, com a janela de cada ocorrência
create or replace function public.fn_checklist_occurrences(p_template uuid, p_from date, p_to date)
returns table (occ_start timestamptz, occ_end timestamptz) language sql stable as $$
  with t as (select * from public.checklist_templates where id = p_template),
  d as (
    select g::date as day from generate_series(p_from, p_to, interval '1 day') g
  ),
  hit as (
    select d.day from d, t where
      (t.schedule_type = 'diario' and (t.include_sundays or extract(dow from d.day) <> 0))
      or (t.schedule_type = 'semanal' and extract(dow from d.day) = coalesce(t.weekday, 1))
      or (t.schedule_type = 'mensal' and extract(day from d.day) = coalesce(t.month_day, 1))
      or (t.schedule_type = 'ciclo' and d.day >= t.start_date and (d.day - t.start_date) % t.cycle_days = 0)
      or (t.schedule_type = 'datas' and d.day = any (t.dates))
  )
  select h.day::timestamptz,
    case when t.schedule_type = 'diario' then (h.day + 1)::timestamptz
         else coalesce(lead(h.day) over (order by h.day), h.day + case t.schedule_type when 'semanal' then 7 when 'mensal' then 31 when 'ciclo' then t.cycle_days else 7 end)::timestamptz end
  from hit h, t
$$;

-- BI de checklist: adesão por pessoa, grupo e periodicidade, tempo médio e painel de respostas
create or replace function public.fn_checklist_bi(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable as $$
declare r jsonb; v_to timestamptz := least(p_to, now());
begin
  with tpl as (select * from public.checklist_templates where active),
  targets as ( -- pessoas que devem responder cada modelo (grupos expandidos)
    select distinct t.id as template_id, coalesce(tt.person_id, gm.person_id) as person_id, tt.group_id
    from tpl t join public.checklist_template_targets tt on tt.template_id = t.id
    left join public.v_group_members gm on gm.group_id = tt.group_id
    where coalesce(tt.person_id, gm.person_id) is not null
  ),
  occ as (
    select t.id as template_id, o.occ_start, o.occ_end from tpl t, lateral public.fn_checklist_occurrences(t.id, p_from::date, v_to::date) o
    where o.occ_start >= date_trunc('day', p_from) and o.occ_start <= v_to
  ),
  exp as ( -- cada ocorrência prevista × pessoa, com a resposta (se houver)
    select tg.template_id, tg.person_id, tg.group_id, o.occ_start,
      (select r.id from public.checklist_responses r where r.template_id = tg.template_id and r.person_id = tg.person_id and r.finished_at >= o.occ_start and r.finished_at < o.occ_end order by r.finished_at limit 1) as response_id
    from targets tg join occ o on o.template_id = tg.template_id
  ),
  resp as (select r.* from public.checklist_responses r join tpl on tpl.id = r.template_id where r.finished_at between p_from and v_to),
  ans as (select a.*, q.label, q.type, q.template_id from public.checklist_answers a join resp on resp.id = a.response_id join public.checklist_questions q on q.id = a.question_id)
  select jsonb_build_object(
    'expected', (select count(*) from (select distinct template_id, person_id, occ_start from exp) x),
    'done', (select count(*) from (select distinct template_id, person_id, occ_start from exp where response_id is not null) x),
    'responses', (select count(*) from resp),
    'avg_fill_s', (select round(avg(extract(epoch from (finished_at - started_at)))) from resp),
    'by_person', coalesce((select jsonb_agg(x order by (x->>'adherence')::numeric nulls first) from (
        select jsonb_build_object('person_id', p.id, 'name', p.name, 'role', p.role, 'expected', count(*), 'done', count(e.response_id),
          'adherence', round(count(e.response_id)::numeric / nullif(count(*), 0), 4),
          'avg_fill_s', (select round(avg(extract(epoch from (r.finished_at - r.started_at)))) from resp r where r.person_id = p.id)) as x
        from (select distinct template_id, person_id, occ_start, response_id from exp) e join public.people p on p.id = e.person_id group by p.id, p.name, p.role) s), '[]'::jsonb),
    'by_group', coalesce((select jsonb_agg(x order by x->>'name') from (
        select jsonb_build_object('group_id', g.id, 'name', g.name, 'expected', count(*), 'done', count(e.response_id), 'adherence', round(count(e.response_id)::numeric / nullif(count(*), 0), 4)) as x
        from exp e join public.respondent_groups g on g.id = e.group_id group by g.id, g.name) s), '[]'::jsonb),
    'by_schedule', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('schedule', t.schedule_type, 'expected', count(*), 'done', count(e.response_id), 'adherence', round(count(e.response_id)::numeric / nullif(count(*), 0), 4)) as x
        from (select distinct template_id, person_id, occ_start, response_id from exp) e join tpl t on t.id = e.template_id group by t.schedule_type) s), '[]'::jsonb),
    'by_template', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('template_id', t.id, 'name', t.name, 'schedule', t.schedule_type, 'expected', count(*), 'done', count(e.response_id), 'adherence', round(count(e.response_id)::numeric / nullif(count(*), 0), 4),
          'avg_fill_s', (select round(avg(extract(epoch from (r.finished_at - r.started_at)))) from resp r where r.template_id = t.id)) as x
        from (select distinct template_id, person_id, occ_start, response_id from exp) e join tpl t on t.id = e.template_id group by t.id, t.name, t.schedule_type) s), '[]'::jsonb),
    'missing', coalesce((select jsonb_agg(x order by x->>'date' desc) from (
        select jsonb_build_object('date', e.occ_start, 'person', p.name, 'template', t.name) as x
        from (select distinct template_id, person_id, occ_start from exp where response_id is null) e join public.people p on p.id = e.person_id join tpl t on t.id = e.template_id
        order by e.occ_start desc limit 200) s), '[]'::jsonb),
    'assets_checked', (select count(distinct asset_id) from resp where asset_id is not null),
    'assets_flagged', (select count(distinct resp.asset_id) from resp join ans on ans.response_id = resp.id where ans.flagged and resp.asset_id is not null),
    'questions', coalesce((select jsonb_agg(x order by (x->>'flag_rate')::numeric desc nulls last) from (
        select jsonb_build_object('question_id', q.id, 'template', t.name, 'label', q.label, 'type', q.type, 'answers', count(a.id),
          'flagged', count(a.id) filter (where a.flagged), 'flag_rate', round(count(a.id) filter (where a.flagged)::numeric / nullif(count(a.id), 0), 4),
          'avg', round(avg(a.num_value) filter (where q.type = 'nota'), 2),
          'values', (select jsonb_agg(jsonb_build_object('value', vv.value, 'qty', vv.qty) order by vv.qty desc) from (
              select a2.value, count(*) as qty from ans a2 where a2.question_id = q.id and q.type in ('sim_nao','multipla','nota') group by a2.value) vv)) as x
        from public.checklist_questions q join tpl t on t.id = q.template_id left join ans a on a.question_id = q.id
        where q.type in ('sim_nao','multipla','nota','foto','texto') group by q.id, t.name, q.label, q.type) s), '[]'::jsonb)
  ) into r;
  return r;
end $$;

alter table public.people enable row level security;
alter table public.respondent_groups enable row level security;
alter table public.respondent_group_members enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_targets enable row level security;
alter table public.checklist_questions enable row level security;
alter table public.checklist_responses enable row level security;
alter table public.checklist_answers enable row level security;
create policy own_people on public.people for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_groups on public.respondent_groups for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_group_members on public.respondent_group_members for all to anon, authenticated using (exists (select 1 from public.respondent_groups g where g.id = group_id and g.client_id = public.current_client_id()));
create policy own_templates on public.checklist_templates for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_targets on public.checklist_template_targets for all to anon, authenticated using (exists (select 1 from public.checklist_templates t where t.id = template_id and t.client_id = public.current_client_id()));
create policy own_questions on public.checklist_questions for all to anon, authenticated using (exists (select 1 from public.checklist_templates t where t.id = template_id and t.client_id = public.current_client_id()));
create policy own_responses on public.checklist_responses for all to anon, authenticated using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy own_answers on public.checklist_answers for all to anon, authenticated using (exists (select 1 from public.checklist_responses r where r.id = response_id and r.client_id = public.current_client_id()));
