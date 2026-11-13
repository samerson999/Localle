import { describe, expect, it } from 'vitest';
import { criticalMap, isOcorrencia } from './critical';

const alerta = (p: Record<string, unknown>) => ({ id: String(Math.random()), assetId: 'a1', title: 'SOS', priority: 'alta', ts: 1000, ...p });

describe('ocorrência × aviso', () => {
  it('o backend decide (exigeTratamento); sem o campo, alta é ocorrência', () => {
    expect(isOcorrencia(alerta({ priority: 'alta', requiresTreatment: false }))).toBe(false);
    expect(isOcorrencia(alerta({ priority: 'baixa', requiresTreatment: true }))).toBe(true);
    expect(isOcorrencia(alerta({ priority: 'alta' }))).toBe(true);
    expect(isOcorrencia(alerta({ priority: 'media' }))).toBe(false);
    expect(isOcorrencia(alerta({ priority: 'alta', title: 'Rodando sem viagem' }))).toBe(false);
  });

  it('criticalMap: só ocorrência aberta conta; repetições do mesmo tipo no ativo viram uma, desde a mais antiga', () => {
    const m = criticalMap({
      alerts: [
        alerta({ id: 'x1', ts: 2000 }),
        alerta({ id: 'x2', ts: 1000 }),
        alerta({ id: 'x3', title: 'Porta aberta', priority: 'baixa', requiresTreatment: false }),
        alerta({ id: 'x4', title: 'Bateria', priority: 'media', requiresTreatment: true, resolvedAt: 3000 }),
        alerta({ id: 'x5', title: 'Ré', priority: 'alta', requiresTreatment: false }),
      ],
    });
    const rs = m.get('a1')!;
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ title: 'SOS', since: 1000, detail: '2 ocorrências sem tratamento' });
    expect(rs[0].alertIds!.sort()).toEqual(['x1', 'x2']);
  });
});
