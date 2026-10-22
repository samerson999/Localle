-- Seed mínimo: a rastreadora, o cliente de estudo e os parâmetros.
-- Ativos, planos, OS e pneus são importados da simulação pelo botão
-- "Importar dados da simulação" no app.
insert into public.tenants (id, name) values ('00000000-0000-0000-0000-000000000001', 'Rastreadora Demo');
insert into public.clients (id, tenant_id, name) values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Transportes Exemplo Ltda');
insert into public.dev_settings (id, dev_client_id) values (1, '00000000-0000-0000-0000-000000000010');
insert into public.tire_settings (client_id) values ('00000000-0000-0000-0000-000000000010');
insert into public.alert_recipients (client_id, level, name, email) values
 ('00000000-0000-0000-0000-000000000010', 'alerta', 'Gestor de frota', 'gestor@demo.com'),
 ('00000000-0000-0000-0000-000000000010', 'critico', 'Dono da empresa', 'dono@demo.com'),
 ('00000000-0000-0000-0000-000000000010', 'sem_acao', 'Dono da empresa', 'dono@demo.com');
update public.alert_recipients set wait_hours = 48 where level = 'sem_acao';
select public.fn_default_event_types('00000000-0000-0000-0000-000000000010');

-- Rastreadoras de teste para o Painel da Locale (vínculos dos últimos 15 meses)
insert into public.tenants (id, name) values
 ('00000000-0000-0000-0000-000000000002', 'Rastreia Nordeste'),
 ('00000000-0000-0000-0000-000000000003', 'Sat Track Caruaru'),
 ('00000000-0000-0000-0000-000000000004', 'Olinda Monitoramento');
insert into public.tenant_billing (tenant_id, model, price, min_accesses, extra_price, basis) values
 ('00000000-0000-0000-0000-000000000001', 'por_rastreador', 2, 100, 2, 'ativos'),
 ('00000000-0000-0000-0000-000000000002', 'por_rastreador', 2, 100, 2, 'ativos'),
 ('00000000-0000-0000-0000-000000000003', 'pacote_minimo', 2, 80, 2, 'ativos'),
 ('00000000-0000-0000-0000-000000000004', 'por_rastreador', 2, 100, 2, 'ativos');
insert into public.tracker_links (tenant_id, asset_name, client_name, imei, linked_at, unlinked_at)
select t.id, 'VEI' || lpad(g::text, 4, '0'), (array['Transportes Litoral','Frigorífico Agreste','Distribuidora Sertão','Construtora Mar'])[1 + g % 4],
  '86' || right(t.id::text, 1) || lpad(g::text, 10, '0'),
  ts, case when random() < t.churn then ts + make_interval(days => 30 + (random() * 300)::int) end
from (values ('00000000-0000-0000-0000-000000000002'::uuid, 360, 0.15), ('00000000-0000-0000-0000-000000000003'::uuid, 95, 0.2), ('00000000-0000-0000-0000-000000000004'::uuid, 50, 0.3)) t(id, n, churn)
cross join lateral generate_series(1, t.n) g
cross join lateral (select now() - make_interval(days => (random() * 450)::int) as ts) x;
update public.tracker_links set unlinked_at = null where unlinked_at > now();
insert into public.tracker_stock (tenant_id, imei, model)
select t, '86' || right(t::text, 1) || '9' || lpad(g::text, 9, '0'), 'GT06' from (values ('00000000-0000-0000-0000-000000000001'::uuid, 4), ('00000000-0000-0000-0000-000000000002'::uuid, 40), ('00000000-0000-0000-0000-000000000003'::uuid, 12), ('00000000-0000-0000-0000-000000000004'::uuid, 6)) s(t, n) cross join lateral generate_series(1, s.n) g;
