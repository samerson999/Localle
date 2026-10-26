import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Ciclo de vida do ativo (PRODUCT.md › Capabilities, "Ciclo de vida"): vendido e baixado saem das telas
// operacionais, mas a linha nunca é apagada — posições, eventos e instalações antigas continuam apontando
// para ela e os relatórios de período ainda contam o veículo enquanto operou. `status_desde` registra
// quando entrou no status atual.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('assets', {
    status: {
      type: 'text',
      notNull: true,
      default: 'ativo',
      check: "status in ('ativo', 'vendido', 'baixado')",
    },
    status_desde: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('assets', ['status', 'status_desde']);
}
