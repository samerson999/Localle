import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// docs/PLANO-SETUP-ADMIN.md: registro de parâmetros com herança Plataforma → Revenda → Cliente → Grupo.
// Decisão de 23/10/2026 (conversa com o Samerson): construir só a camada Cliente agora — Revenda e
// Grupo não existem como entidade no backend ainda (nenhuma outra feature os usa), então criar as duas
// tabelas e a lógica de herança entre elas agora seria especulativo. O desenho de `client_settings`
// (chave solta, sem FK para uma tabela de "definições") deixa Revenda/Grupo entrarem depois como novas
// tabelas de override (`revenda_settings`, `group_settings`) consultadas na mesma ordem de resolução,
// sem precisar alterar esta tabela. O padrão de cada chave e seus limites ficam no código
// (`src/settings/setting-definitions.ts`), não no banco — é o "registro central" do plano, só que em
// TypeScript em vez de SQL, pelo mesmo motivo (nada mais consome isso dinamicamente ainda).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('client_settings', {
    client_id: { type: 'uuid', notNull: true, references: 'clients', onDelete: 'CASCADE' },
    key: { type: 'text', notNull: true },
    value: { type: 'jsonb', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('client_settings', 'client_settings_pkey', {
    primaryKey: ['client_id', 'key'],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('client_settings');
}
