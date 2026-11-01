import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseUpdateAsset } from './update-asset.dto';

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
