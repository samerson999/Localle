-- =====================================================================
-- Fase 1, item 2: indicadores de manutenção calculados no banco.
-- O front chama a função duas vezes (período A e B) para os comparativos.
-- =====================================================================
create or replace function public.fn_maintenance_kpis(p_from timestamptz, p_to timestamptz, p_asset_ids uuid[] default null)
returns jsonb language plpgsql stable as $$
declare
  v_to timestamptz := least(p_to, now());
  v_hours numeric := greatest(extract(epoch from (least(p_to, now()) - p_from)) / 3600.0, 0);
  r jsonb;
begin
  with veh as (
    select a.id, a.name from public.assets a
    where a.kind = 'veiculo' and (p_asset_ids is null or a.id = any (p_asset_ids))
  ),
  wo as (
    select w.*, (w.type = 'corretiva' and w.unplanned) as is_failure from public.work_orders w join veh on veh.id = w.asset_id where w.status <> 'cancelada'
  ),
  down as ( -- horas paradas na oficina dentro do período
    select asset_id, sum(greatest(0, extract(epoch from (least(coalesce(executed_at, now()), v_to) - greatest(shop_in_at, p_from))) / 3600.0)) as h
    from wo where shop_in_at is not null and shop_in_at < v_to and coalesce(executed_at, now()) > p_from group by asset_id
  ),
  km as ( -- km rodado no período pelas leituras de odômetro
    select o.asset_id, max(o.km) - min(o.km) as km from public.odometer_readings o join veh on veh.id = o.asset_id
    where o.read_at between p_from and v_to
    group by o.asset_id
  ),
  done as ( -- OS executadas no período (base de custo)
    select * from wo where status = 'concluida' and executed_at between p_from and v_to
  ),
  fails as (select * from done where is_failure),
  plan_done as ( -- preventivas de plano executadas no período e se foram com atraso
    select d.*, (d.due_date is not null and d.executed_at::date > d.due_date) or (d.due_km is not null and d.odometer_at > d.due_km) as late,
      greatest(0, d.executed_at::date - d.due_date) as delay_days
    from done d where d.plan_id is not null
  ),
  crit as ( -- OS que passaram de Crítico no período (vencidas acima da regra)
    select distinct on (h.work_order_id) h.work_order_id, h.changed_at from public.work_order_level_history h join wo on wo.id = h.work_order_id
    where h.level = 'critico' and h.changed_at between p_from and v_to order by h.work_order_id, h.changed_at
  ),
  tot as (
    select (select count(*) from veh) as n_veh,
      coalesce((select sum(h) from down), 0) as down_h,
      coalesce((select sum(km) from km), 0) as km,
      (select count(*) from fails) as n_fail,
      coalesce((select avg(extract(epoch from (executed_at - shop_in_at)) / 3600.0) from fails where shop_in_at is not null), 0) as mttr,
      coalesce((select sum(cost) from done where type = 'preventiva'), 0) as c_prev,
      coalesce((select sum(cost) from done where type = 'corretiva'), 0) as c_corr,
      (select count(*) from done where type = 'preventiva') as n_prev,
      (select count(*) from done where type = 'corretiva') as n_corr,
      (select count(*) from plan_done) as n_plan_done,
      (select count(*) from plan_done where late) as n_late,
      coalesce((select avg(delay_days) from plan_done where late), 0) as avg_delay
  )
  select jsonb_build_object(
    'from', p_from, 'to', v_to, 'vehicles', t.n_veh, 'hours', round(v_hours, 1),
    'downtime_h', round(t.down_h, 1),
    'availability', case when t.n_veh * v_hours > 0 then round(1 - t.down_h / (t.n_veh * v_hours), 4) end,
    'failures', t.n_fail,
    'mtbf_h', case when t.n_fail > 0 then round((t.n_veh * v_hours - t.down_h) / t.n_fail, 1) end,
    'km', round(t.km), 'mkbf', case when t.n_fail > 0 then round(t.km / t.n_fail) end,
    'mttr_h', round(t.mttr, 1),
    'cost_total', round(t.c_prev + t.c_corr, 2), 'cost_prev', round(t.c_prev, 2), 'cost_corr', round(t.c_corr, 2),
    'n_prev', t.n_prev, 'n_corr', t.n_corr,
    'cost_per_km', case when t.km > 0 then round((t.c_prev + t.c_corr) / t.km, 4) end,
    'overdue_critical', (select count(*) from crit),
    'plan_done', t.n_plan_done, 'late_done', t.n_late, 'avg_delay_days', round(t.avg_delay, 1),
    'by_asset', coalesce((select jsonb_agg(x order by (x->>'cost')::numeric desc) from (
        select jsonb_build_object('asset_id', v.id, 'name', v.name,
          'cost_prev', coalesce(sum(d.cost) filter (where d.type = 'preventiva'), 0), 'cost_corr', coalesce(sum(d.cost) filter (where d.type = 'corretiva'), 0),
          'cost', coalesce(sum(d.cost), 0), 'failures', count(*) filter (where d.is_failure),
          'downtime_h', round(coalesce((select h from down where down.asset_id = v.id), 0), 1), 'km', coalesce((select km.km from km where km.asset_id = v.id), 0)) as x
        from veh v left join done d on d.asset_id = v.id group by v.id, v.name) s), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(m order by m->>'month') from (
        select jsonb_build_object('month', to_char(date_trunc('month', executed_at), 'YYYY-MM'),
          'cost_prev', coalesce(sum(cost) filter (where type = 'preventiva'), 0), 'cost_corr', coalesce(sum(cost) filter (where type = 'corretiva'), 0),
          'failures', count(*) filter (where is_failure)) as m
        from done group by date_trunc('month', executed_at)) s), '[]'::jsonb),
    'top_failures', coalesce((select jsonb_agg(f) from (
        select jsonb_build_object('title', title, 'qty', count(*), 'cost', coalesce(sum(cost), 0)) as f
        from fails group by title order by count(*) desc, sum(cost) desc limit 8) s), '[]'::jsonb),
    'overdue_list', coalesce((select jsonb_agg(o order by o->>'since' desc) from (
        select jsonb_build_object('number', w.number, 'asset', v.name, 'title', w.title, 'due_date', w.due_date, 'due_km', w.due_km, 'since', c.changed_at, 'status', w.status) as o
        from crit c join wo w on w.id = c.work_order_id join veh v on v.id = w.asset_id) s), '[]'::jsonb)
  ) into r from tot t;
  return r;
end $$;
