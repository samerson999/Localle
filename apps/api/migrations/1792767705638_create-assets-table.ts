import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Primeira tabela de negócio escopada por `client_id` (docs/ARQUITETURA-BACKEND.md § 2.1) — serve de
// prova do `BaseRepository` (src/db/base.repository.ts) e da suite de isolamento entre clientes
// (src/assets/assets.isolation.spec.ts). Modela só o essencial do "ativo" (PRODUCT.md § Gestão de
// ativos); placa/documentos/ciclo de vida entram quando o módulo virar trabalho de verdade.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('assets', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    client_id: {
      type: 'uuid',
      notNull: true,
      references: 'clients',
      onDelete: 'CASCADE',
    },
    plate: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('assets', 'client_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('assets');
}
