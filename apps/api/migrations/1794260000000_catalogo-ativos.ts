import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Marca, modelo e tipo de ativo por lista, por cliente (backlog do teste da FD Locação, 09/11/2026): com texto livre o
// mesmo modelo virava três ("13190", "13.190", "13.190 CR 4x2"). Decisões de 10/11/2026: a lista é de cada cliente,
// quem edita ativos cria e renomeia, e o cliente pode ter tipos próprios (com ícone escolhido no catálogo do front).
// - `chave`: o nome sem acento, pontuação, espaço e maiúsculas — é ela que é única, então "13190" e "13.190" são o
//   mesmo modelo. Gerada pelo banco (fn_chave_catalogo), para a regra valer em qualquer caminho de escrita.
// - FKs compostas com `client_id`: modelo só aponta para marca do mesmo cliente e ativo só para modelo do mesmo
//   cliente — o banco recusa o cruzamento, não só o repository.
// - `ativo_tipos.padrao`: linha que renomeia (ou troca o ícone de) um tipo que vem pronto no front (ex.: 'cavalo');
//   nulo = tipo criado pelo cliente. `base` decide os campos do cadastro (placa, medidor) como o `kind` do front.
// - Backfill: marcas e modelos que o cliente já digitou na ficha (`assets.dados`) entram na lista e o ativo aponta
//   para o modelo. Grafias diferentes com a mesma chave viram uma só (fica a mais usada).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create function public.fn_chave_catalogo(nome text) returns text
      language sql immutable parallel safe
      return lower(regexp_replace(
        translate(nome, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'),
        '[^a-zA-Z0-9]', '', 'g'));

    create table public.ativo_marcas (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null check (length(trim(nome)) between 1 and 60),
      chave text generated always as (public.fn_chave_catalogo(nome)) stored check (chave <> ''),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint ativo_marcas_client_id_id_key unique (client_id, id),
      constraint ativo_marcas_client_id_chave_key unique (client_id, chave)
    );

    create table public.ativo_modelos (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      marca_id uuid not null,
      nome text not null check (length(trim(nome)) between 1 and 80),
      chave text generated always as (public.fn_chave_catalogo(nome)) stored check (chave <> ''),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint ativo_modelos_marca_fk foreign key (client_id, marca_id) references public.ativo_marcas(client_id, id) on delete cascade,
      constraint ativo_modelos_client_id_id_key unique (client_id, id),
      constraint ativo_modelos_marca_id_chave_key unique (marca_id, chave)
    );

    create table public.ativo_tipos (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      nome text not null check (length(trim(nome)) between 1 and 60),
      chave text generated always as (public.fn_chave_catalogo(nome)) stored check (chave <> ''),
      base text not null check (base in ('veiculo', 'implemento', 'linha_amarela', 'equipamento')),
      padrao text check (padrao ~ '^[a-z_]{1,40}$'),
      icone text check (icone ~ '^[0-9]{2}-[a-z0-9-]{1,60}$'),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint ativo_tipos_client_id_chave_key unique (client_id, chave),
      constraint ativo_tipos_client_id_padrao_key unique (client_id, padrao)
    );

    alter table public.assets
      add column modelo_id uuid,
      add constraint assets_modelo_fk foreign key (client_id, modelo_id) references public.ativo_modelos(client_id, id) on delete set null (modelo_id);
    create index on public.assets (modelo_id) where modelo_id is not null;

    insert into public.ativo_marcas (client_id, nome)
      select distinct on (client_id, public.fn_chave_catalogo(nome)) client_id, nome from (
        select client_id, left(trim(dados->>'brand'), 60) as nome, count(*) as n from public.assets
        where public.fn_chave_catalogo(coalesce(dados->>'brand', '')) <> '' group by 1, 2
      ) m order by client_id, public.fn_chave_catalogo(nome), n desc, nome;

    insert into public.ativo_modelos (client_id, marca_id, nome)
      select distinct on (mc.id, public.fn_chave_catalogo(x.nome)) x.client_id, mc.id, x.nome from (
        select client_id, public.fn_chave_catalogo(dados->>'brand') as marca, left(trim(dados->>'model'), 80) as nome, count(*) as n
        from public.assets
        where public.fn_chave_catalogo(coalesce(dados->>'brand', '')) <> '' and public.fn_chave_catalogo(coalesce(dados->>'model', '')) <> ''
        group by 1, 2, 3
      ) x join public.ativo_marcas mc on mc.client_id = x.client_id and mc.chave = x.marca
      order by mc.id, public.fn_chave_catalogo(x.nome), x.n desc, x.nome;

    update public.assets a set modelo_id = mo.id
      from public.ativo_modelos mo join public.ativo_marcas mc on mc.id = mo.marca_id
      where mo.client_id = a.client_id and mc.chave = public.fn_chave_catalogo(coalesce(a.dados->>'brand', ''))
        and mo.chave = public.fn_chave_catalogo(coalesce(a.dados->>'model', ''));
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.assets drop constraint assets_modelo_fk, drop column modelo_id;
    drop table public.ativo_tipos;
    drop table public.ativo_modelos;
    drop table public.ativo_marcas;
    drop function public.fn_chave_catalogo(text);
  `);
}
