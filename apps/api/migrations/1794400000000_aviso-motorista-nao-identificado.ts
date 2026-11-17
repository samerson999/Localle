import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Aviso de veículo rodando sem identificação do motorista (decisões de 17/11/2026, continuação de 1794390000000):
// - só vale onde há leitor: o modelo aceita leitor de cartão (`rastreador_modelos.leitor_motorista`) E o técnico marcou
//   o leitor como instalado naquela instalação (`instalacoes.leitor_motorista`) — o leitor é acessório, nem sempre vai;
// - o gestor liga no Setup (`motoristas.exigir_identificacao`, desligado por padrão) e ajusta a tolerância;
// - é aviso (não exige tratamento), um por viagem, e fecha sozinho quando o cartão é lido.
// `viagem_identificacao`: por ativo, a viagem em curso (ignição ligada) e quanto tempo andou sem cartão; some quando a
// ignição desliga. É estado da ingestão, não histórico.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.rastreador_modelos add column leitor_motorista boolean not null default false;
    alter table public.instalacoes add column leitor_motorista boolean not null default false;

    insert into public.alerta_tipos (chave, nome, prioridade, exige_tratamento, gera_alerta, sistema, disparo, notifica_push)
    values ('motorista_nao_identificado', 'Veículo rodando sem identificação do motorista', 'baixa', false, true, true, 'sistema', false)
    on conflict (chave) do nothing;

    create table public.viagem_identificacao (
      asset_id uuid primary key references public.assets(id) on delete cascade,
      client_id uuid not null references public.clients(id) on delete cascade,
      viagem_desde timestamptz not null,
      ultimo_ts timestamptz not null,
      andando_s integer not null default 0 check (andando_s >= 0),
      alerta_id uuid references public.alertas(id) on delete set null
    );
    create index on public.viagem_identificacao (client_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.viagem_identificacao;
    delete from public.alertas where tipo = 'motorista_nao_identificado';
    delete from public.alerta_tipos where chave = 'motorista_nao_identificado';
    alter table public.instalacoes drop column leitor_motorista;
    alter table public.rastreador_modelos drop column leitor_motorista;
  `);
}
