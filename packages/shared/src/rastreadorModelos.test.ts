import { describe, expect, it } from 'vitest';
import { normalizarIdentificador, validarIdentificador } from './rastreadorModelos';

describe('identificador do rastreador conforme o modelo', () => {
  it('IMEI: exatamente 15 dígitos', () => {
    expect(validarIdentificador('imei', '866703066592389')).toBeNull();
    expect(validarIdentificador('imei', '8667 0306 6592 389')).toBeNull(); // espaços digitados não contam
    expect(validarIdentificador('imei', '86670306659238')).toMatch(/15 dígitos/);
    expect(validarIdentificador('imei', '86670306659238X')).toMatch(/15 dígitos/);
  });

  it('terminal JT808: 12 ou 20 dígitos — o IMEI de 15 não passa (o caso do JR12 cadastrado com IMEI)', () => {
    expect(validarIdentificador('terminal_jt808', '012345678901')).toBeNull();
    expect(validarIdentificador('terminal_jt808', '01234567890123456789')).toBeNull();
    expect(validarIdentificador('terminal_jt808', '866703066592389')).toMatch(/12 dígitos/);
  });

  it('outro: texto curto sem espaço; vazio sempre recusa', () => {
    expect(validarIdentificador('outro', 'ABC-123_x.9')).toBeNull();
    expect(validarIdentificador('outro', 'ab')).toMatch(/4 a 40/);
    expect(validarIdentificador('imei', '   ')).toBe('Informe o identificador do aparelho');
    expect(normalizarIdentificador(' 12 34 ')).toBe('1234');
  });
});
