import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Override de permissão por (cliente, papel, chave) — deliberadamente uma tabela própria, não
// `client_settings`: a resolução de autorização não deve depender do mesmo armazenamento genérico usado
// para parâmetros operacionais (motivo: mudar o shape de `client_settings` por necessidade de um
// parâmetro numérico nunca pode, sem querer, afetar a resolução de permissão). O catálogo (chave, padrão
// por papel, `editableByClient`) fica em código — src/permissions/permission-definitions.ts — pelo mesmo
// raciocínio já aplicado a `client_settings`/`setting-definitions.ts`.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('role_permission_overrides', {
    client_id: { type: 'uuid', notNull: true, references: 'clients', onDelete: 'CASCADE' },
    role: { type: 'text', notNull: true, check: "role in ('admin', 'gestor', 'operador')" },
    permission_key: { type: 'text', notNull: true },
    allowed: { type: 'boolean', notNull: true },
    updated_by: { type: 'uuid', notNull: true, references: 'users' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('role_permission_overrides', 'role_permission_overrides_pkey', {
    primaryKey: ['client_id', 'role', 'permission_key'],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('role_permission_overrides');
}
