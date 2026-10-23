import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Chip pertence à Locale e é cedido em comodato junto com o rastreador (mesmo raciocínio de
// `rastreadores`: sem `client_id` aqui, o dono num dado momento é resolvido via `instalacoes` do
// rastreador ao qual o chip está vinculado). Vínculo atual fica direto em `rastreador_id`; histórico de
// troca de chip entra em `audit_log` (ação `sim_card.vincular`/`sim_card.desvincular`), não numa tabela
// própria — não há hoje necessidade concreta de consultar esse histórico por período, só de auditá-lo.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('sim_cards', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    iccid: { type: 'text', notNull: true, unique: true },
    operadora: { type: 'text' },
    numero: { type: 'text' },
    status: {
      type: 'text',
      notNull: true,
      default: 'estoque',
      check: "status in ('estoque', 'ativo', 'inativo')",
    },
    rastreador_id: { type: 'uuid', references: 'rastreadores', onDelete: 'SET NULL' },
    criado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    atualizado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Um chip só pode estar vinculado a um rastreador por vez (garantido pela própria coluna), e um
  // rastreador só pode ter um chip vinculado por vez — essa segunda regra não vem de graça de uma FK
  // simples, por isso o índice único parcial.
  pgm.createIndex('sim_cards', 'rastreador_id', {
    name: 'sim_cards_rastreador_id_uidx',
    unique: true,
    where: 'rastreador_id is not null',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('sim_cards');
}
