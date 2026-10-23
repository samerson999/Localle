import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.1: identidade física do rastreador, sem `client_id` —
// o dono num dado momento é sempre resolvido via `instalacoes` (próxima migração), nunca lido direto
// daqui (um rastreador é reinstalado entre clientes ao longo da vida).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('rastreadores', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    traccar_device_id: { type: 'bigint', unique: true },
    imei: { type: 'text', notNull: true },
    modelo: { type: 'text' },
    protocolo: { type: 'text' },
    status: {
      type: 'text',
      notNull: true,
      default: 'cadastrado',
      check: "status in ('cadastrado', 'ativo', 'desativado')",
    },
    criado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    atualizado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('rastreadores', 'traccar_device_id');
  pgm.createIndex('rastreadores', 'imei', {
    name: 'rastreadores_imei_ativo_uidx',
    unique: true,
    where: "status <> 'desativado'",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('rastreadores');
}
