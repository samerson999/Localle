import { describe, expect, it } from 'vitest';
import { lerTelemetria } from './leitura';

// Últimos atributos conhecidos de cada aparelho real da HML (tc_positions, 01/11/2026).
const TELTONIKA = { battery: 4.058, hours: 569495010, ignition: true, odometer: 4115170, power: 13.058, rssi: 4, sat: 12 };
const GT06 = { type: 18, sat: 15, status: 70, ignition: true, blocked: false, batteryLevel: 100, rssi: 4, adc1: 13.3 };
const JMAK = { vin: 12507, battery: 3880, ignition: true, out1: false, rssi: 21, sat: 11 };

describe('lerTelemetria', () => {
  it('sem mapeamento lê as chaves padrão do Traccar (aparelho no padrão não precisa de configuração)', () => {
    expect(lerTelemetria(TELTONIKA)).toEqual({ tensaoV: 13.06, satelites: 12, sinalGsm: 4, bloqueado: null });
    expect(lerTelemetria({ power: 12.4, sat: 9, rssi: 3, blocked: true })).toEqual({ tensaoV: 12.4, satelites: 9, sinalGsm: 3, bloqueado: true });
  });

  it('modelo fora do padrão: chave de tensão e escala do sinal vêm do catálogo', () => {
    expect(lerTelemetria(GT06, { atributoTensao: 'adc1', sinalMax: 4, atributoBloqueio: null })).toEqual({ tensaoV: 13.3, satelites: 15, sinalGsm: 5, bloqueado: false });
    expect(lerTelemetria(JMAK, { atributoTensao: 'vin', sinalMax: 31, atributoBloqueio: 'out1' })).toEqual({ tensaoV: 12.51, satelites: 11, sinalGsm: 3, bloqueado: false });
  });

  it('sem o mapeamento, dado fora do padrão fica "não informado" — nunca um número de escala errada', () => {
    // JR12 sem configuração: não há `power`; rssi 21 não cabe na escala padrão 0–5
    expect(lerTelemetria(JMAK)).toEqual({ tensaoV: null, satelites: 11, sinalGsm: null, bloqueado: null });
  });

  it('normaliza unidade pela faixa física e descarta valor impossível ou de tipo errado', () => {
    expect(lerTelemetria({ power: 12850 }).tensaoV).toBe(12.85); // mV
    expect(lerTelemetria({ power: 70000, sat: -1, rssi: -71 })).toEqual({ tensaoV: null, satelites: null, sinalGsm: null, bloqueado: null });
    expect(lerTelemetria({ power: '13.3', blocked: 'false', sat: 7.5 })).toEqual({ tensaoV: null, satelites: null, sinalGsm: null, bloqueado: null });
    expect(lerTelemetria({ blocked: 1 }).bloqueado).toBe(true);
    expect(lerTelemetria(null)).toEqual({ tensaoV: null, satelites: null, sinalGsm: null, bloqueado: null });
  });
});
