import { describe, expect, it } from 'vitest';
import { fmtCoord } from './reportExport';

// Sprint de monitoramento 28/10/2026, bug 4: coordenada exportada com casas variáveis/mal lida no Excel.
describe('fmtCoord', () => {
  it('6 casas fixas, ponto decimal, sinal preservado', () => {
    expect(fmtCoord(-8.0512345678)).toBe('-8.051235');
    expect(fmtCoord(-34.9)).toBe('-34.900000');
    expect(fmtCoord('-8.05')).toBe('-8.050000'); // a API devolve numeric como texto
    expect(fmtCoord(0)).toBe('0.000000');
  });

  it('sem valor válido sai vazio, nunca "NaN"', () => {
    expect(fmtCoord(null)).toBe('');
    expect(fmtCoord(undefined)).toBe('');
    expect(fmtCoord('')).toBe('');
    expect(fmtCoord('abc')).toBe('');
  });
});
