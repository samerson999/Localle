import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// `clients` é a âncora de `client_id` (docs/ARQUITETURA-BACKEND.md § 2.1): toda tabela de negócio
// multi-tenant referencia esta tabela e é filtrada por ela na camada única de acesso ao banco
// (BaseRepository, src/db/base.repository.ts). Modela a camada "Cliente" de
// Plataforma → Revenda → Cliente → Grupo (PRODUCT.md); `revenda_id` fica solto (sem FK) até a tabela
// de revendas existir.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension('pgcrypto', { ifNotExists: true });
  // TimescaleDB (posicoes/eventos) e PostGIS (cercas) também nascem aqui, e não só em infra/plataforma/init: o init
  // roda apenas na criação do volume, e o Coolify da HML não o montou (extensões criadas à mão em 28/10/2026). Ficam na
  // primeira migration porque uma migration nova com timestamp anterior às que as usam quebraria a checagem de ordem em
  // bancos já migrados. Idempotente (`if not exists`); o down não as remove — outras tabelas dependem delas.
  pgm.createExtension('timescaledb', { ifNotExists: true });
  pgm.createExtension('postgis', { ifNotExists: true });

  pgm.createTable('clients', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    revenda_id: { type: 'uuid', notNull: false },
    name: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('clients', 'revenda_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('clients');
}
