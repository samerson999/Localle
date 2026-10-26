import { describe, expect, it } from 'vitest';
import { parseConvidado, parseLimite, parseNovoCliente } from './parse-superadmin-input';

describe('parseNovoCliente', () => {
  it('normaliza nome e e-mail do admin; senha enviada pelo painel é ignorada (o convidado define a dele)', () => {
    expect(parseNovoCliente({ name: '  Transportes X ', admin: { email: ' Ana@X.com ', password: 'nao-usada' } })).toEqual({
      name: 'Transportes X',
      revendaId: undefined,
      admin: { email: 'ana@x.com' },
    });
  });

  it('admin é opcional', () => {
    expect(parseNovoCliente({ name: 'X' }).admin).toBeUndefined();
  });

  it.each([
    [{}],
    [{ name: '   ' }],
    [{ name: 'x'.repeat(201) }],
    [{ name: 'X', revendaId: 'nao-uuid' }],
    [{ name: 'X', admin: { email: 'sem-arroba' } }],
    [{ name: 'X', admin: {} }],
    [null],
  ])('rejeita %j com 400', (body) => {
    expect(() => parseNovoCliente(body)).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('parseConvidado / parseLimite', () => {
  it('rejeita e-mail que não é string', () => {
    expect(() => parseConvidado({ email: 123 })).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('limite: padrão, válido e fora da faixa', () => {
    expect(parseLimite(undefined, 100, 500)).toBe(100);
    expect(parseLimite('20', 100, 500)).toBe(20);
    expect(() => parseLimite('0', 100, 500)).toThrow();
    expect(() => parseLimite('501', 100, 500)).toThrow();
    expect(() => parseLimite('abc', 100, 500)).toThrow();
  });
});
