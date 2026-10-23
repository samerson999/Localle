import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Superadmin (Locale) fica fora da hierarquia de clientes — tabela própria, sem `client_id`, para não
// ter como um registro de superadmin "vazar" para dentro do filtro por `client_id` que todo repository
// de domínio aplica (BaseRepository). Qualquer ação de superadmin sobre um cliente usa `client_id`
// explícito no path da rota (nunca implícito de um token), e é auditada (`audit_log`, próxima migração).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('superadmins', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('superadmins');
}
