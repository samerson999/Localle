import { describe, expect, it } from 'vitest';
import { aplicarMascara, formatarAno, formatarCnpj, formatarCpf, formatarPlaca, formatarTelefone, mascaraValida, placaValida } from './mascaras';

describe('formatação enquanto digita', () => {
  it('CPF: só dígitos, até 11, pontuação progressiva', () => {
    expect(formatarCpf('529')).toBe('529');
    expect(formatarCpf('5299')).toBe('529.9');
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
    expect(formatarCpf('529.982.247-25999abc')).toBe('529.982.247-25');
    expect(formatarCpf('abc')).toBe('');
  });

  it('CNPJ: até 14 dígitos', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCnpj('112223')).toBe('11.222.3');
  });

  it('telefone: celular, fixo, 0800 e sem separador sobrando no fim', () => {
    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(formatarTelefone('8134567890')).toBe('(81) 3456-7890');
    expect(formatarTelefone('08001234567')).toBe('0800 123 4567');
    expect(formatarTelefone('11')).toBe('(11');
    expect(formatarTelefone('119')).toBe('(11) 9');
    expect(formatarTelefone('(11) 98765-43219999')).toBe('(11) 98765-4321');
    expect(formatarTelefone('')).toBe('');
  });

  it('placa: maiúscula, sem hífen, cada posição só aceita o tipo certo', () => {
    expect(formatarPlaca('abc-1234')).toBe('ABC1234');
    expect(formatarPlaca('abc1d23')).toBe('ABC1D23');
    expect(formatarPlaca('a1bc')).toBe('ABC'); // dígito na 2ª posição é descartado
    expect(formatarPlaca('ABC1D23XYZ')).toBe('ABC1D23');
    expect(formatarPlaca('ABCD')).toBe('ABC'); // 4ª posição só dígito
  });

  it('ano: 2024 ou 2024/2025', () => {
    expect(formatarAno('20242025')).toBe('2024/2025');
    expect(formatarAno('2024')).toBe('2024');
    expect(formatarAno('20a24')).toBe('2024');
  });

  it('é idempotente: reaplicar no valor formatado não muda nada', () => {
    for (const [m, v] of [['cpf', '529.982.247-25'], ['cnpj', '11.222.333/0001-81'], ['telefone', '(11) 98765-4321'], ['placa', 'ABC1D23'], ['ano', '2024/2025']] as const) {
      expect(aplicarMascara(m, aplicarMascara(m, v))).toBe(aplicarMascara(m, v));
    }
  });

  it('dígitos com limite (CNH, ICCID, chave de NF-e)', () => {
    expect(aplicarMascara('cnh', '0123 4567 8901')).toBe('01234567890');
    expect(aplicarMascara('digitos', '8955 0123 4567 8901 2345 6', 20)).toBe('89550123456789012345');
  });
});

describe('validação', () => {
  it('placa antiga e Mercosul', () => {
    expect(placaValida('ABC1234')).toBe(true);
    expect(placaValida('ABC1D23')).toBe(true);
    expect(placaValida('ABC12')).toBe(false);
  });

  it('vazio é válido (obrigatoriedade é do formulário) e CNH segue a regra da API', () => {
    expect(mascaraValida('cpf', '')).toBe(true);
    expect(mascaraValida('cnh', '123456789')).toBe(true);
    expect(mascaraValida('cnh', '12345678')).toBe(false);
    expect(mascaraValida('ano', '2024/25')).toBe(false);
  });
});
