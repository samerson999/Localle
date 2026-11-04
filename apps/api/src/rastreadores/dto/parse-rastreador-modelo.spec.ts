import { describe, expect, it } from 'vitest';
import { parseAtualizarModelo, parseCriarModelo } from './parse-rastreador-modelo';

const BASE = { fabricante: 'Teltonika', nome: 'FMC150', protocolo: 'teltonika', porta: 5027, tipoIdentificador: 'imei' };

describe('parse do modelo — sinais de motor / CAN', () => {
  it('sem os campos novos, não mexe neles (o banco aplica o padrão "não informado")', () => {
    const d = parseCriarModelo(BASE);
    expect(d).not.toHaveProperty('suporte_can');
    expect(d).not.toHaveProperty('sinais_motor');
  });

  it('aceita suporte, sinais (sem repetição) e atributo por sinal; vazio volta ao padrão do Traccar', () => {
    expect(parseAtualizarModelo({ suporteCan: 'nativo', sinaisMotor: ['rpm', 'odometro', 'rpm'], atributoRpm: 'io85', atributoCombustivel: '' })).toEqual({
      suporte_can: 'nativo', sinais_motor: ['rpm', 'odometro'], atributo_rpm: 'io85', atributo_combustivel: null,
    });
    expect(parseAtualizarModelo({ sinaisMotor: [] })).toEqual({ sinais_motor: [] });
  });

  it('recusa suporte, sinal ou nome de atributo fora do formato', () => {
    expect(() => parseAtualizarModelo({ suporteCan: 'sim' })).toThrow(/suporteCan/);
    expect(() => parseAtualizarModelo({ sinaisMotor: 'rpm' })).toThrow(/sinaisMotor/);
    expect(() => parseAtualizarModelo({ sinaisMotor: ['rpm', 'pressao'] })).toThrow(/sinaisMotor/);
    expect(() => parseAtualizarModelo({ atributoHorimetro: 'hours; drop table' })).toThrow(/atributoHorimetro/);
  });
});
