import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseNomeMarca, parseNovoModelo, parseTipo } from './catalogo-ativos.dto';

describe('catálogo de ativos: entrada', () => {
  it('nome com letra ou número, aparado; vazio, só pontuação ou longo demais recusa', () => {
    expect(parseNomeMarca({ nome: '  Volvo ' })).toBe('Volvo');
    for (const nome of ['', '  ', '...', 'x'.repeat(61), 3, undefined]) expect(() => parseNomeMarca({ nome })).toThrow(BadRequestException);
  });

  it('modelo exige marcaId uuid', () => {
    expect(parseNovoModelo({ marcaId: '9b2f0a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', nome: '13.190' })).toEqual({ marcaId: '9b2f0a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', nome: '13.190' });
    expect(() => parseNovoModelo({ marcaId: 'abc', nome: '13.190' })).toThrow(BadRequestException);
  });

  it('tipo: base da lista; padrao e ícone opcionais no formato certo', () => {
    expect(parseTipo({ nome: 'Trator de esteira', base: 'linha_amarela' })).toEqual({ nome: 'Trator de esteira', base: 'linha_amarela', padrao: null, icone: null });
    expect(parseTipo({ nome: 'Compactador', base: 'veiculo', padrao: 'caminhao', icone: '18-coletor' })).toMatchObject({ padrao: 'caminhao', icone: '18-coletor' });
    for (const b of [{ nome: 'X', base: 'aviao' }, { nome: 'X', base: 'veiculo', padrao: 'Cavalo!' }, { nome: 'X', base: 'veiculo', icone: '../x.png' }]) {
      expect(() => parseTipo(b)).toThrow(BadRequestException);
    }
  });
});
