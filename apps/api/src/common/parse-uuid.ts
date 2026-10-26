import { BadRequestException } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Para id que chega por query/corpo (no path, use `ParseUUIDPipe`). Sem isso, um id malformado chega ao
 * Postgres como `uuid` inválido (22P02) e vira 500 em vez de 400.
 */
export function parseUuid(label: string, value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new BadRequestException(`Parâmetro "${label}" precisa ser um UUID`);
  }
  return value;
}
