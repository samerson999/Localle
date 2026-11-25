import { describe, expect, it } from 'vitest';
import { A_PAGAR, casaFiltroMulta } from './multasFiltro';

const DAY = 86_400_000;
const multa = (status: string, extra: any = {}) => ({ status, ts: Date.now() - 2 * DAY, notifiedAt: Date.now() - DAY, ...extra });

describe('filtro da lista de multas', () => {
  it('"Em aberto" inclui o condutor indicado e o recurso indeferido (continuam a pagar)', () => {
    expect(casaFiltroMulta(multa('aberta'), 'aberta')).toBe(true);
    expect(casaFiltroMulta(multa('condutor_indicado', { indicatedAt: Date.now() }), 'aberta')).toBe(true);
    expect(casaFiltroMulta(multa('recurso_indeferido'), 'aberta')).toBe(true);
    expect(casaFiltroMulta(multa('recurso'), 'aberta')).toBe(false);
    expect(casaFiltroMulta(multa('paga'), 'aberta')).toBe(false);
  });

  it('canceladas têm filtro próprio; "Todas" mostra tudo', () => {
    expect(casaFiltroMulta(multa('cancelada'), 'cancelada')).toBe(true);
    expect(casaFiltroMulta(multa('cancelada'), 'todas')).toBe(true);
    expect(casaFiltroMulta(multa('paga'), 'cancelada')).toBe(false);
  });

  it('"Indicar condutor" é a aberta sem indicação ainda no prazo; o valor a pagar soma o recurso', () => {
    expect(casaFiltroMulta(multa('aberta'), 'indicar')).toBe(true);
    expect(casaFiltroMulta(multa('condutor_indicado', { indicatedAt: Date.now() }), 'indicar')).toBe(false);
    expect(A_PAGAR).toEqual(['aberta', 'condutor_indicado', 'recurso_indeferido', 'recurso']);
  });
});
