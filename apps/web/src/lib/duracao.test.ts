import { describe, expect, it } from 'vitest';
import { duracaoMs } from './duracao';

describe('duracaoMs', () => {
  it('lê milissegundos como escritos no tokens.css', () => {
    expect(duracaoMs('280ms')).toBe(280);
    expect(duracaoMs(' 140ms ')).toBe(140);
  });
  it('converte segundos, como o build minificado entrega', () => {
    expect(duracaoMs('.28s')).toBe(280);
    expect(duracaoMs(' 0.14s')).toBe(140);
  });
  it('sem valor devolve NaN (o chamador usa o padrão)', () => {
    expect(duracaoMs('')).toBeNaN();
  });
});
