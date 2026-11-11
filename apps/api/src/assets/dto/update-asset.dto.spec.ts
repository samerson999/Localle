import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DADOS_MAX_BYTES, parseCreateAsset, parseUpdateAsset } from './update-asset.dto';

describe('parseUpdateAsset (icone)', () => {
  it('aceita nome do catálogo; null ou vazio limpam; ausente não mexe', () => {
    expect(parseUpdateAsset({ icone: '04-picape-cabine-dupla' }).icone).toBe('04-picape-cabine-dupla');
    expect(parseUpdateAsset({ icone: null }).icone).toBeNull();
    expect(parseUpdateAsset({ icone: '' }).icone).toBeNull();
    expect(parseUpdateAsset({ plate: 'abc1d23' }).icone).toBeUndefined();
  });

  it('recusa formato fora do catálogo', () => {
    for (const icone of ['sedan', '../02-sedan', '02-Sedan', 2, {}]) expect(() => parseUpdateAsset({ icone })).toThrow(BadRequestException);
  });
});

describe('parseUpdateAsset (dados e operacaoId)', () => {
  it('aceita ficha como objeto e operação como uuid; null ou vazio limpam a operação', () => {
    const r = parseUpdateAsset({ dados: { brand: 'Volvo' }, operacaoId: '9b2f0a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b' });
    expect(r.dados).toEqual({ brand: 'Volvo' });
    expect(r.operacaoId).toBe('9b2f0a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b');
    expect(parseUpdateAsset({ operacaoId: null }).operacaoId).toBeNull();
    expect(parseUpdateAsset({ operacaoId: '' }).operacaoId).toBeNull();
    expect(parseUpdateAsset({ plate: 'abc1d23' }).dados).toBeUndefined();
  });

  it('recusa ficha que não é objeto, ficha grande demais (arquivo em base64) e operação que não é uuid', () => {
    for (const dados of ['x', [1], null, 3]) expect(() => parseUpdateAsset({ dados })).toThrow(BadRequestException);
    expect(() => parseUpdateAsset({ dados: { photo: 'a'.repeat(DADOS_MAX_BYTES) } })).toThrow(BadRequestException);
    expect(() => parseUpdateAsset({ operacaoId: 'abc' })).toThrow(BadRequestException);
  });
});

describe('placa e identificador', () => {
  it('cadastro aceita só placa, só identificador ou os dois; sem nenhum, recusa', () => {
    expect(parseCreateAsset({ plate: 'abc1d23' })).toEqual({ plate: 'ABC1D23', identificador: null });
    expect(parseCreateAsset({ identificador: '  RETRO-01 ' })).toEqual({ plate: null, identificador: 'RETRO-01' });
    expect(parseCreateAsset({ plate: '', identificador: 'ESC-02' })).toEqual({ plate: null, identificador: 'ESC-02' });
    for (const body of [{}, { plate: '' }, { plate: null, identificador: '  ' }, undefined]) expect(() => parseCreateAsset(body)).toThrow(BadRequestException);
  });

  it('atualização: ausente não mexe; null ou vazio limpa; formato errado recusa', () => {
    expect(parseUpdateAsset({ status: 'ativo' }).plate).toBeUndefined();
    expect(parseUpdateAsset({ plate: null }).plate).toBeNull();
    expect(parseUpdateAsset({ plate: '' }).plate).toBeNull();
    expect(parseUpdateAsset({ identificador: 'FROTA-15' }).identificador).toBe('FROTA-15');
    expect(parseUpdateAsset({ identificador: '' }).identificador).toBeNull();
    expect(() => parseUpdateAsset({ identificador: 'x'.repeat(61) })).toThrow(BadRequestException);
    expect(() => parseUpdateAsset({ identificador: 3 })).toThrow(BadRequestException);
    expect(() => parseUpdateAsset({ plate: 'x'.repeat(21) })).toThrow(BadRequestException);
  });
});
