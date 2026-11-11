import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Ativo sem placa (teste de cadastro da FD Locação, 09/11/2026): linha amarela e equipamento não têm placa, e a placa
// obrigatória travava o cadastro — o contorno foi inventar placa. Placa e identificador são coisas diferentes (a picape
// da locadora tem as duas), então ficam em colunas separadas:
// - `plate` passa a aceitar nulo e só guarda placa de verdade;
// - `identificador`: código interno ou nº de série, de qualquer tipo de ativo; o que estava em `dados.serial` vem junto;
// - `rotulo`: o nome que os relatórios, o mapa e os links mostram — placa, ou o identificador quando não há placa.
//   Coluna gerada para a regra ficar num lugar só, não repetida em cada query.
// Todo ativo precisa de placa ou identificador. Sem unicidade por cliente por enquanto: a HML pode ter placa repetida
// (as inventadas no teste); entra depois de conferir os dados de lá.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.assets
      alter column plate drop not null,
      add column identificador text check (identificador is null or length(identificador) between 1 and 60);

    update public.assets set identificador = left(nullif(trim(dados->>'serial'), ''), 60)
      where identificador is null and nullif(trim(dados->>'serial'), '') is not null;

    alter table public.assets
      add constraint assets_placa_ou_identificador check (plate is not null or identificador is not null),
      add column rotulo text generated always as (coalesce(plate, identificador)) stored;
  `);
}

// `down` só volta se todo ativo tiver placa: ativo cadastrado sem placa depois desta migration impede o `not null`.
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.assets
      drop column rotulo,
      drop constraint assets_placa_ou_identificador,
      drop column identificador,
      alter column plate set not null;
  `);
}
