import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Desativar em vez de apagar: o usuário continua referenciado pelo `audit_log` (actor_id) e por quem
// registrou o quê. `null` = ativo. Login e AuthGuard recusam quem tem data aqui — o guard confere a cada
// requisição porque o JWT (8h) não carrega estado e não pode ser revogado sozinho.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('users', { desativado_em: { type: 'timestamptz' } });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('users', 'desativado_em');
}
