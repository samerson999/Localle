import { describe, expect, it } from 'vitest';
import { motoristaDoAtivo, rotuloMotorista } from './driverLinks';

// Regra de 18/11/2026: no veículo com leitor, quem diz o motorista é o cartão; sem cartão, "Sem motorista".
describe('motorista do veículo pelo cartão', () => {
  const drivers = [{ id: 'm1', name: 'Carla' }, { id: 'fixo', name: 'Motorista da ficha' }];
  const cartao = (extra: any) => ({ id: 'v1', assetId: 'a1', source: 'rastreador', start: 1, end: null, driverId: 'm1', code: '880011', ...extra });
  const estado = (links: any[], leitorCartao: string[] = []) => ({ drivers, driverLinks: links, leitorCartao });

  it('cartão cadastrado lido: o motorista do cartão, mesmo com motorista fixo na ficha', () => {
    const s = estado([cartao({})]);
    expect(motoristaDoAtivo(s, 'a1', 'fixo')).toBe('m1');
    expect(rotuloMotorista(s, { id: 'a1', driverId: 'm1' })).toBe('Carla');
  });

  it('ignição desligada (vínculo encerrado): sem motorista, não volta ao fixo da ficha', () => {
    const s = estado([cartao({ end: 2, endedBy: 'ignicao_desligada' })]);
    expect(motoristaDoAtivo(s, 'a1', 'fixo')).toBe('');
    expect(rotuloMotorista(s, { id: 'a1', driverId: '' })).toBe('Sem motorista');
  });

  it('cartão sem cadastro lido: "Cartão não cadastrado"', () => {
    const s = estado([cartao({ driverId: '', code: '990022' })]);
    expect(motoristaDoAtivo(s, 'a1', 'fixo')).toBe('');
    expect(rotuloMotorista(s, { id: 'a1', driverId: '' })).toBe('Cartão não cadastrado');
  });

  it('leitor marcado na instalação e nenhum cartão lido ainda: sem motorista', () => {
    const s = estado([], ['a1']);
    expect(motoristaDoAtivo(s, 'a1', 'fixo')).toBe('');
    expect(rotuloMotorista(s, { id: 'a1', driverId: '' })).toBe('Sem motorista');
  });

  it('veículo sem leitor: continua o motorista fixo da ficha', () => {
    const s = estado([cartao({ assetId: 'outro' })]);
    expect(motoristaDoAtivo(s, 'a1', 'fixo')).toBe('fixo');
    expect(rotuloMotorista(s, { id: 'a1', driverId: 'fixo' })).toBe('Motorista da ficha');
    expect(rotuloMotorista(s, { id: 'a1', driverId: '' })).toBe('Sem motorista');
  });
});
