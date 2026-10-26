import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseDate } from './parse-date';

describe('parseDate', () => {
  it('aceita ISO 8601 dentro da janela', () => {
    expect(parseDate('from', '2026-01-01T00:00:00Z').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejeita com 400 (não 500) data que estouraria o timestamptz do Postgres', () => {
    expect(() => parseDate('from', '-004714-01-01')).toThrow(BadRequestException);
    expect(() => parseDate('from', '+275760-09-13')).toThrow(BadRequestException);
  });

  it('rejeita não-string (parâmetro repetido chega como array) e texto inválido', () => {
    expect(() => parseDate('from', ['2026-01-01', '2026-01-02'])).toThrow(BadRequestException);
    expect(() => parseDate('from', 'ontem')).toThrow(BadRequestException);
  });
});
