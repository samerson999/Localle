import { BadRequestException } from '@nestjs/common';

// Fora desta janela não existe dado de rastreamento — e datas extremas (ex.: ano -4714) estouram o
// `timestamptz` do Postgres e virariam 500 em vez de 400.
const MIN_MS = Date.UTC(2000, 0, 1);
const MAX_FUTURO_MS = 366 * 86_400_000;

export function parseDate(label: string, value: unknown): Date {
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Parâmetro "${label}" inválido: esperado data ISO 8601`);
  }
  if (date.getTime() < MIN_MS || date.getTime() > Date.now() + MAX_FUTURO_MS) {
    throw new BadRequestException(`Parâmetro "${label}" fora do intervalo aceito`);
  }
  return date;
}
