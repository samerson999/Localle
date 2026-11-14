import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// O contrato passa a ser a fonte do que cada cliente acessa (14/11/2026): `modulos` já existia e agora é aplicado
// (ModuloGuard na API, menu e rotas no front). As subpáginas (Replay, Cercas, relatórios…) que a Locale desliga
// para um cliente ficam aqui também — antes eram só um ajuste no navegador de quem clicava (Revenda › Módulos).
// Lista de rotas desligadas: vazio = todas liberadas, então página nova nasce ligada sem tocar nos contratos.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`alter table public.contrato_versoes add column paginas_bloqueadas text[] not null default '{}';`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('alter table public.contrato_versoes drop column paginas_bloqueadas;');
}
