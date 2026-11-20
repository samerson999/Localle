import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Pneus saem do navegador (18/11/2026): a tela registra, por movimentação, detalhes que não são estado do pneu —
// fornecedor e banda da recapagem, origem da medição (manual × profundímetro). Ficam em `dados`, como já é em `pneus`.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`alter table public.pneu_movimentos add column dados jsonb not null default '{}'`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`alter table public.pneu_movimentos drop column dados`);
}
