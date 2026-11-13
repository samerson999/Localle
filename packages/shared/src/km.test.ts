import { describe, expect, it } from 'vitest';
import { assetKm, consolidateTrackerReadings, kmDoRastreador } from './km';

// 12/11/2026: os veículos da nossa API tinham odômetro 0 (a API não manda odômetro do aparelho): o km "oficial" dava 0 ou o
// ajuste da instalação parado, e a manutenção por km nunca andava. Decisão: km só do que o aparelho manda (painel/CAN);
// sem isso, valem os lançamentos.
const base = (asset: any, vehicle: any, extra: any = {}) => ({
  assets: [{ id: 'a1', tracker: true, meter: 'km', kmSource: 'rastreador', kmOffset: 0, ...asset }],
  vehicles: vehicle ? { a1: vehicle } : {},
  fuelings: [], odometerReadings: [], workOrders: [], ...extra,
});

describe('kmDoRastreador', () => {
  it('odômetro do painel (CAN) entra como veio, sem o ajuste do ativo', () => {
    expect(kmDoRastreador({ meter: 'km', kmOffset: 45000 }, { odometer: null, odoPainel: 120345.6 })).toBe(120345.6);
  });

  it('aparelho da API sem CAN não informa km: null, nunca 0', () => {
    expect(kmDoRastreador({ meter: 'km', kmOffset: 45000 }, { odometer: null, odoPainel: null })).toBeNull();
    expect(kmDoRastreador({ meter: 'horimetro' }, { hourmeter: null })).toBeNull();
    expect(kmDoRastreador({ meter: 'km' }, undefined)).toBeNull();
  });

  it('integração antiga: odômetro do aparelho com o ajuste do ativo', () => {
    expect(kmDoRastreador({ meter: 'km', kmOffset: 1000 }, { odometer: 500 })).toBe(1500);
    expect(kmDoRastreador({ meter: 'km', kmOffset: 1000 }, { odometer: 500 }, false)).toBe(500);
  });
});

describe('assetKm', () => {
  const abastecimento = { assetId: 'a1', ts: 1, odometer: 80200 };

  it('origem rastreador com CAN: o número do painel', () => {
    expect(assetKm(base({}, { odometer: null, odoPainel: 81000 }, { fuelings: [abastecimento] }), 'a1')).toBe(81000);
  });

  it('origem rastreador sem km do aparelho: o último lançamento, não 0', () => {
    expect(assetKm(base({}, { odometer: null, odoPainel: null }, { fuelings: [abastecimento] }), 'a1')).toBe(80200);
  });

  it('mescla sem km do aparelho: o ajuste da instalação não vira km (antes dava 45.000 parado para sempre)', () => {
    const s = base({ kmSource: 'mesclado', kmOffset: 45000 }, { odometer: null, odoPainel: null }, { fuelings: [abastecimento] });
    expect(assetKm(s, 'a1')).toBe(80200);
  });

  it('mescla com CAN: o maior entre painel e lançamento', () => {
    expect(assetKm(base({ kmSource: 'mesclado', kmOffset: 45000 }, { odometer: null, odoPainel: 81000 }, { fuelings: [abastecimento] }), 'a1')).toBe(81000);
  });

  it('integração antiga sem mudança: rastreador cru, mescla com ajuste', () => {
    expect(assetKm(base({ kmOffset: 1000 }, { odometer: 500 }), 'a1')).toBe(500);
    expect(assetKm(base({ kmSource: 'mesclado', kmOffset: 1000 }, { odometer: 500 }), 'a1')).toBe(1500);
  });
});

describe('consolidateTrackerReadings', () => {
  it('rastreador sem km não grava leitura "do rastreador"', () => {
    expect(consolidateTrackerReadings(base({ kmOffset: 45000 }, { odometer: null, odoPainel: null }))).toBeNull();
  });

  it('com CAN grava a leitura do dia com o número do painel', () => {
    const r = consolidateTrackerReadings(base({ kmOffset: 45000 }, { odometer: null, odoPainel: 81000.44 }), Date.parse('2026-11-12T15:00:00Z'));
    expect(r).toEqual([expect.objectContaining({ assetId: 'a1', km: 81000.4, source: 'rastreador' })]);
  });
});
