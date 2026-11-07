import { describe, expect, it } from 'vitest';
import { cnpjValido, cpfValido, telefoneValido } from './documentos';

describe('documentos', () => {
  it('CPF confere os dígitos verificadores e rejeita repetidos', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('529.982.247')).toBe(false);
  });

  it('CNPJ confere os dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
    expect(cnpjValido('00.000.000/0000-00')).toBe(false);
  });

  it('telefone exige DDD; celular começa em 9, fixo em 2–5', () => {
    expect(telefoneValido('(11) 98765-4321')).toBe(true);
    expect(telefoneValido('(81) 3456-7890')).toBe(true);
    expect(telefoneValido('0800 123 4567')).toBe(true);
    expect(telefoneValido('(11) 88765-4321')).toBe(false);
    expect(telefoneValido('(01) 3456-7890')).toBe(false);
    expect(telefoneValido('98765-4321')).toBe(false);
  });

});
