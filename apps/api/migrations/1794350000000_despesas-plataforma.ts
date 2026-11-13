import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Despesas da Locale (13/11/2026): o custo da Visão geral do Console era constante no código (chip R$ 9 por veículo +
// infraestrutura R$ 650). Agora é cadastro: cada despesa é fixa no mês ou por veículo ativo, com vigência por mês
// (inicio_em/fim_em sempre no dia 1) — mudar o valor a partir de um mês é encerrar a antiga e cadastrar a nova, e os
// meses passados continuam com o custo que tinham. Dado da plataforma, não de cliente: sem client_id (como superadmins).
// O seed reproduz a estimativa antiga, para a margem não cair a zero até alguém cadastrar os valores reais.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.despesas_plataforma (
      id uuid primary key default gen_random_uuid(),
      nome text not null check (length(btrim(nome)) between 1 and 120),
      tipo text not null check (tipo in ('fixa', 'por_veiculo')),
      valor numeric(12, 2) not null check (valor >= 0),
      inicio_em date not null check (extract(day from inicio_em) = 1),
      fim_em date check (fim_em is null or (extract(day from fim_em) = 1 and fim_em >= inicio_em)),
      observacao text check (observacao is null or length(observacao) <= 500),
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now()
    );
    insert into public.despesas_plataforma (nome, tipo, valor, inicio_em, observacao) values
      ('Chips (linha de dados)', 'por_veiculo', 9, '2026-01-01', 'Valor estimado que estava fixo no sistema — confira'),
      ('Infraestrutura (servidores)', 'fixa', 650, '2026-01-01', 'Valor estimado que estava fixo no sistema — confira');
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop table public.despesas_plataforma;');
}
