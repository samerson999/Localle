import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Base da autenticação (docs/ARQUITETURA-BACKEND.md § 8, item 5): de onde o `client_id` de uma
// requisição vem de verdade, substituindo o placeholder por header `x-client-id`
// (src/clients/client-id.decorator.ts). Escopo mínimo para o MVP (monitoramento/ativos/relatórios):
// só o perfil "gestor da frota", vinculado a um único cliente — perfis de revenda/Locale (sem
// client_id fixo, PRODUCT.md § Users) ficam para quando esses módulos entrarem em pauta.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    client_id: {
      type: 'uuid',
      notNull: true,
      references: 'clients',
      onDelete: 'CASCADE',
    },
    email: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true, default: 'gestor', check: "role in ('gestor')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('users', 'client_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('users');
}
