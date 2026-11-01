import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Ícone ilustrado 3D escolhido no cadastro do ativo (apps/web/src/images/png-tight, ex.: "02-sedan"). Até aqui
// ficava só no navegador de quem escolheu e se perdia em outro navegador/usuário ou quando o armazenamento local
// enchia. Nulo = sem ícone (a tela mostra a silhueta da categoria). O formato é o nome do arquivo do catálogo;
// o catálogo em si é do front, então o banco só garante a forma, não que o arquivo exista.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('assets', {
    icone: { type: 'text', check: "icone ~ '^[0-9]{2}-[a-z0-9-]{1,60}$'" },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('assets', ['icone']);
}
