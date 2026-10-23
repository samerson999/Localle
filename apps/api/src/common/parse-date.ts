import { BadRequestException } from '@nestjs/common';

export function parseDate(label: string, value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Parâmetro "${label}" inválido: esperado data ISO 8601`);
  }
  return date;
}
