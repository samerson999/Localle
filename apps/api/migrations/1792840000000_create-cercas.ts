import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Cercas são do backend (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.3: as cercas do Traccar ficam
// desligadas; entrada/saída é calculada aqui sobre a posição recebida). Círculo guarda centro + raio em
// metros (ST_DWithin em geography, distância real); polígono guarda a geometria (ST_Covers). Uma cerca
// apagada pela tela só recebe `removida_em`: eventos e relatórios antigos continuam com nome e tipo.
//
// `cerca_presenca`: em quais cercas cada ativo está agora (o "antes" de fenceCrossing), e
// `cerca_avaliacao`: o fix_time da última posição avaliada por ativo — posição atrasada (fix_time menor)
// não reavalia, senão faria o estado andar para trás e gerar entrada/saída falsas.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.cercas (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null,
      tipo text not null,
      forma text not null check (forma in ('circulo', 'poligono')),
      centro geometry(Point, 4326),
      raio_m numeric(10, 1),
      poligono geometry(Polygon, 4326),
      alerta_entrada boolean not null default false,
      alerta_saida boolean not null default false,
      -- null = padrão (alta para 'Área de risco', media para o resto — mesmo fencePriority do front)
      prioridade_alerta text check (prioridade_alerta in ('alta', 'media', 'baixa')),
      inicia_viagem boolean not null default false,
      encerra_viagem boolean not null default false,
      velocidade_limite_kmh numeric(5, 1),
      permanencia_max_min integer,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      removida_em timestamptz,
      constraint cercas_forma_geometria check (
        (forma = 'circulo' and centro is not null and raio_m > 0 and poligono is null)
        or (forma = 'poligono' and poligono is not null and st_isvalid(poligono) and centro is null and raio_m is null)
      )
    );
  `);
  pgm.sql('create index on public.cercas (client_id) where removida_em is null;');
  pgm.sql('create index on public.cercas using gist (poligono);');
  pgm.sql('create index on public.cercas using gist ((centro::geography));');

  pgm.sql(`
    create table public.cerca_presenca (
      asset_id uuid not null references public.assets(id) on delete cascade,
      cerca_id uuid not null references public.cercas(id) on delete cascade,
      client_id uuid not null references public.clients(id) on delete cascade,
      desde timestamptz not null,
      primary key (asset_id, cerca_id)
    );
  `);
  pgm.sql('create index on public.cerca_presenca (client_id);');

  pgm.sql(`
    create table public.cerca_avaliacao (
      asset_id uuid primary key references public.assets(id) on delete cascade,
      fix_time timestamptz not null
    );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('cerca_avaliacao');
  pgm.dropTable('cerca_presenca');
  pgm.dropTable('cercas');
}
