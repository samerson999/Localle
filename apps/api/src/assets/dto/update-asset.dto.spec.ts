import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DADOS_MAX_BYTES, parseUpdateAsset } from './update-asset.dto';

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
