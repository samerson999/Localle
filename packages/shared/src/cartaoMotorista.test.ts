import { describe, expect, it } from 'vitest';
import { normalizarCodigo } from './cartaoMotorista';

describe('código do cartão do motorista', () => {
  it('normaliza: sem separadores, maiúsculas, sem zeros à esquerda; vazio/zero = sem código', () => {
    expect(normalizarCodigo('00000000A1B2C3D4')).toBe('A1B2C3D4'); // iButton (Teltonika) em hex de 16 dígitos
    expect(normalizarCodigo('a1:b2-c3 d4')).toBe('A1B2C3D4');
    expect(normalizarCodigo(2844255995)).toBe('2844255995'); // RFID decimal (J-R10) chegando como número
    expect(normalizarCodigo('0')).toBeNull();
    expect(normalizarCodigo(0)).toBeNull();
    expect(normalizarCodigo('')).toBeNull();
    expect(normalizarCodigo(' -- ')).toBeNull();
    expect(normalizarCodigo(-5)).toBeNull();
    expect(normalizarCodigo(1.5)).toBeNull();
    expect(normalizarCodigo(true)).toBeNull();
    expect(normalizarCodigo('X'.repeat(33))).toBeNull();
  });
});
