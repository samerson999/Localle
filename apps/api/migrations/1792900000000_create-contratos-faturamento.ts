import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Console da Locale · Contratos e Faturamento (docs/PLANO-SETUP-ADMIN.md § 0, telas 2–4). Regra de cálculo em
// `@localle/shared/contratos` (mesma no front e aqui).
//
// - `contratos`: um por cliente; `status` e vigência não são versionados. `status` suspenso/cancelado bloqueia
//   o acesso dos usuários do cliente (AuthGuard/login), não a ingestão de posições.
// - `contrato_versoes`: condições comerciais; a vigente é a mais recente. Nunca atualizada — mudar valor
//   grava uma versão nova, então uma fatura sempre aponta para os termos que a calcularam.
// - `faturas`: competência fechada. Guarda o resultado e a medição usada (`veiculos_media`) além da versão,
//   porque a medição vem de `instalacoes` e pode ser corrigida depois — o fechado não muda.
// - `pagamentos`: registro manual, aceita parciais e várias datas por fatura.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.contratos (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null unique references public.clients(id) on delete cascade,
      status text not null default 'implantacao' check (status in ('implantacao', 'ativo', 'suspenso', 'cancelado')),
      inicio_em date not null default current_date,
      fim_em date,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      check (fim_em is null or fim_em >= inicio_em)
    );

    create table public.contrato_versoes (
      id uuid primary key default gen_random_uuid(),
      contrato_id uuid not null references public.contratos(id) on delete cascade,
      client_id uuid not null references public.clients(id) on delete cascade,
      tipo_cobranca text not null check (tipo_cobranca in ('mensalidade_fixa', 'por_veiculo_ativo')),
      mensalidade_fixa numeric(12, 2) not null default 0 check (mensalidade_fixa >= 0),
      franquia integer not null default 0 check (franquia >= 0),
      mensalidade_base numeric(12, 2) not null default 0 check (mensalidade_base >= 0),
      preco_por_veiculo numeric(12, 2) not null default 0 check (preco_por_veiculo >= 0),
      preco_excedente numeric(12, 2) not null default 0 check (preco_excedente >= 0),
      modulos text[] not null default '{}',
      max_usuarios integer check (max_usuarios is null or max_usuarios > 0),
      historico_meses integer not null check (historico_meses between 1 and 120),
      dia_vencimento integer not null check (dia_vencimento between 1 and 28),
      tolerancia_dias integer not null default 0 check (tolerancia_dias between 0 and 90),
      criado_por uuid not null,
      criado_em timestamptz not null default now()
    );
    create index on public.contrato_versoes (contrato_id, criado_em desc);

    create table public.faturas (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      competencia date not null check (extract(day from competencia) = 1),
      contrato_versao_id uuid not null references public.contrato_versoes(id),
      veiculos_media numeric(12, 4) not null default 0,
      valor_base numeric(12, 2) not null,
      valor_excedente numeric(12, 2) not null,
      valor_total numeric(12, 2) not null check (valor_total >= 0),
      vencimento date not null,
      fechada_por uuid not null,
      fechada_em timestamptz not null default now(),
      unique (client_id, competencia)
    );

    create table public.pagamentos (
      id uuid primary key default gen_random_uuid(),
      fatura_id uuid not null references public.faturas(id) on delete cascade,
      client_id uuid not null references public.clients(id) on delete cascade,
      valor numeric(12, 2) not null check (valor > 0),
      pago_em date not null,
      forma text not null check (forma in ('pix', 'boleto', 'cartao', 'transferencia')),
      observacao text,
      registrado_por uuid not null,
      registrado_em timestamptz not null default now()
    );
    create index on public.pagamentos (fatura_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop table public.pagamentos; drop table public.faturas; drop table public.contrato_versoes; drop table public.contratos;');
}
