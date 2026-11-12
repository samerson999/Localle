import { describe, expect, it } from 'vitest';
import { lerTelemetria, lerTelemetriaComIdade } from './leitura';

// Últimos atributos conhecidos de cada aparelho real da HML (tc_positions, 01/11/2026).
const TELTONIKA = { battery: 4.058, hours: 569495010, ignition: true, odometer: 4115170, power: 13.058, rssi: 4, sat: 12 };
const GT06 = { type: 18, sat: 15, status: 70, ignition: true, blocked: false, batteryLevel: 100, rssi: 4, adc1: 13.3 };
const JMAK = { vin: 12507, battery: 3880, ignition: true, out1: false, rssi: 21, sat: 11 };

describe('lerTelemetria', () => {
  it('sem mapeamento lê as chaves padrão do Traccar (aparelho no padrão não precisa de configuração)', () => {
    expect(lerTelemetria(TELTONIKA)).toEqual({ tensaoV: 13.06, satelites: 12, sinalGsm: 4, bloqueado: null, alimentacaoExterna: true });
    expect(lerTelemetria({ power: 12.4, sat: 9, rssi: 3, blocked: true })).toEqual({ tensaoV: 12.4, satelites: 9, sinalGsm: 3, bloqueado: true, alimentacaoExterna: true });
  });

  it('modelo fora do padrão: chave de tensão e escala do sinal vêm do catálogo', () => {
    expect(lerTelemetria(GT06, { atributoTensao: 'adc1', sinalMax: 4, atributoBloqueio: null })).toEqual({ tensaoV: 13.3, satelites: 15, sinalGsm: 5, bloqueado: false, alimentacaoExterna: true });
    expect(lerTelemetria(JMAK, { atributoTensao: 'vin', sinalMax: 31, atributoBloqueio: 'out1' })).toEqual({ tensaoV: 12.51, satelites: 11, sinalGsm: 3, bloqueado: false, alimentacaoExterna: true });
  });

  it('sem o mapeamento, dado fora do padrão fica "não informado" — nunca um número de escala errada', () => {
    // JR12 sem configuração: não há `power`; rssi 21 não cabe na escala padrão 0–5
    expect(lerTelemetria(JMAK)).toEqual({ tensaoV: null, satelites: 11, sinalGsm: null, bloqueado: null, alimentacaoExterna: null });
  });

  it('normaliza unidade pela faixa física e descarta valor impossível ou de tipo errado', () => {
    expect(lerTelemetria({ power: 12850 }).tensaoV).toBe(12.85); // mV
    expect(lerTelemetria({ power: 70000, sat: -1, rssi: -71 })).toEqual({ tensaoV: null, satelites: null, sinalGsm: null, bloqueado: null, alimentacaoExterna: null });
    expect(lerTelemetria({ power: '13.3', blocked: 'false', sat: 7.5 })).toEqual({ tensaoV: null, satelites: null, sinalGsm: null, bloqueado: null, alimentacaoExterna: null });
    expect(lerTelemetria({ blocked: 1 }).bloqueado).toBe(true);
    expect(lerTelemetria(null)).toEqual({ tensaoV: null, satelites: null, sinalGsm: null, bloqueado: null, alimentacaoExterna: null });
  });

  it('alimentação externa: pela tensão quando há, senão pelo `charge`; o alarme `powerCut` não decide', () => {
    expect(lerTelemetria({ power: 0.72 }).alimentacaoExterna).toBe(false); // JR12 de bancada, fio cortado
    expect(lerTelemetria({ power: 5.9 }).alimentacaoExterna).toBe(false);
    expect(lerTelemetria({ power: 6 }).alimentacaoExterna).toBe(true);
    expect(lerTelemetria({ ...GT06, charge: false }).alimentacaoExterna).toBe(false); // GT06 não manda tensão
    expect(lerTelemetria({ ...GT06, charge: true }).alimentacaoExterna).toBe(true);
    expect(lerTelemetria({ power: 12.6, charge: false }).alimentacaoExterna).toBe(true); // tensão é a leitura direta
    expect(lerTelemetria({ alarm: 'powerCut' }).alimentacaoExterna).toBeNull(); // alarme preso no último valor não vira estado
    expect(lerTelemetria({ charge: 1 }).alimentacaoExterna).toBeNull();
  });

  it('odômetro do painel (CAN): `obdOdometer` em metros vira km, com a idade da chave; sem CAN ou fora da faixa fica null', () => {
    // JR12 instalado (tc_positions da HML, 11/11/2026): odômetro do painel em metros, passo de 1 km
    const jr12 = { power: 12.992, sat: 24, rssi: 31, ignition: false, obdOdometer: 2.684e7, obdSpeed: 0, canStatus: 1 };
    const vistos = { obdOdometer: '2026-11-12T01:38:16.217Z', power: '2026-11-12T02:08:16.274Z' };
    const t = lerTelemetriaComIdade(jr12, vistos);
    expect(t.odometroPainelKm).toBe(26840);
    expect(t.lidaEm?.odometroPainel).toBe('2026-11-12T01:38:16.217Z');
    expect(lerTelemetriaComIdade({ obdOdometer: 12_345_678 }, {}).odometroPainelKm).toBe(12345.7);
    // modelo que manda o odômetro do painel em outra chave: vem do catálogo
    expect(lerTelemetriaComIdade({ odo_can: 5_000_000 }, {}, { atributoTensao: null, sinalMax: null, atributoBloqueio: null, atributoOdometro: 'odo_can' }).odometroPainelKm).toBe(5000);
    // hodômetro do GPS (`odometer`) não é o do painel
    expect(lerTelemetriaComIdade(TELTONIKA, {}).odometroPainelKm).toBeNull();
    expect(lerTelemetriaComIdade({ obdOdometer: -1 }, { obdOdometer: '2026-11-12T01:38:16.217Z' })).toMatchObject({ odometroPainelKm: null, lidaEm: { odometroPainel: null } });
    expect(lerTelemetriaComIdade({ obdOdometer: '26840000' }, {}).odometroPainelKm).toBeNull();
  });

  it('velocidade do painel (CAN): `obdSpeed` em km/h com a idade da chave; fora da faixa ou sem CAN fica null', () => {
    const vistos = { obdSpeed: '2026-11-12T01:37:42.153Z' };
    expect(lerTelemetriaComIdade({ obdSpeed: 27.72 }, vistos)).toMatchObject({ velocidadePainelKmh: 27.7, lidaEm: { velocidadePainel: '2026-11-12T01:37:42.153Z' } });
    expect(lerTelemetriaComIdade({ obdSpeed: 0 }, vistos).velocidadePainelKmh).toBe(0); // parado é leitura válida
    expect(lerTelemetriaComIdade({ obdSpeed: 400 }, vistos)).toMatchObject({ velocidadePainelKmh: null, lidaEm: { velocidadePainel: null } });
    expect(lerTelemetriaComIdade({ obdSpeed: '27' }, vistos).velocidadePainelKmh).toBeNull();
    expect(lerTelemetriaComIdade(TELTONIKA, {}).velocidadePainelKmh).toBeNull();
  });

  it('idade da alimentação é a da chave que decidiu', () => {
    const vistos = { power: '2026-11-05T10:00:00.000Z', charge: '2026-11-05T09:00:00.000Z' };
    expect(lerTelemetriaComIdade({ power: 12.6, charge: true }, vistos).lidaEm?.alimentacaoExterna).toBe('2026-11-05T10:00:00.000Z');
    expect(lerTelemetriaComIdade({ charge: true }, vistos).lidaEm?.alimentacaoExterna).toBe('2026-11-05T09:00:00.000Z');
    expect(lerTelemetriaComIdade({}, vistos).lidaEm?.alimentacaoExterna).toBeNull();
  });
});
