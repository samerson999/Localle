import { describe, expect, it } from 'vitest';
import { apurar, avgActiveVehicles, daysLate, dueDateOf, estimar, validateTerms, type ContractTerms, type DailyMeasurement } from './contratos';

const base: ContractTerms = { billingType: 'por_veiculo_ativo', fixedPrice: 0, included: 0, basePrice: 0, pricePerVehicle: 99, extraPrice: 99, modules: ['monitoramento'], maxUsers: null, historyMonths: 12, dueDay: 10, toleranceDays: 5 };
const dias = (ym: string, n: number, qtd: (i: number) => number): DailyMeasurement[] =>
  Array.from({ length: n }, (_, i) => ({ date: `${ym}-${String(i + 1).padStart(2, '0')}`, activeVehicles: qtd(i) }));

describe('apurar', () => {
  it('mensalidade fixa ignora a medição', () => {
    expect(apurar({ ...base, billingType: 'mensalidade_fixa', fixedPrice: 2400 }, dias('2026-10', 31, () => 50), '2026-10')).toMatchObject({ total: 2400, avgVehicles: 0 });
  });

  it('por veículo sem franquia: média de veículos-dia × preço, proporcional ao mês inteiro', () => {
    // 10 veículos só nos últimos 15 dias de um mês de 30 → média 5
    const m = dias('2026-11', 30, (i) => (i >= 15 ? 10 : 0));
    expect(avgActiveVehicles(m, '2026-11')).toBe(5);
    expect(apurar(base, m, '2026-11')).toMatchObject({ avgVehicles: 5, base: 0, extra: 495, total: 495 });
  });

  it('com franquia: base fixa + excedente acima dos inclusos; abaixo da franquia paga só a base', () => {
    const v = { ...base, included: 20, basePrice: 1500, extraPrice: 60 };
    expect(apurar(v, dias('2026-11', 30, () => 25), '2026-11')).toMatchObject({ base: 1500, extra: 300, total: 1800 });
    expect(apurar(v, dias('2026-11', 30, () => 10), '2026-11')).toMatchObject({ base: 1500, extra: 0, total: 1500 });
  });

  it('ignora medições fora da competência', () => {
    const m = [...dias('2026-10', 31, () => 100), ...dias('2026-11', 30, () => 3)];
    expect(apurar(base, m, '2026-11').avgVehicles).toBe(3);
  });

  it('arredonda em centavos', () => {
    // 1 veículo em 1 dia de 31 × 99 = 3,1935… → 3,19
    expect(apurar(base, [{ date: '2026-10-05', activeVehicles: 1 }], '2026-10').total).toBe(3.19);
  });
});

describe('estimar / vencimento / atraso', () => {
  it('estimativa com a frota atual', () => {
    expect(estimar(base, 10)).toBe(990);
    expect(estimar({ ...base, included: 5, basePrice: 300, extraPrice: 50 }, 8)).toBe(450);
  });

  it('vence no dia do mês seguinte, inclusive na virada de ano', () => {
    expect(dueDateOf('2026-10', 10)).toBe('2026-11-10');
    expect(dueDateOf('2026-12', 5)).toBe('2027-01-05');
  });

  it('dias de atraso nunca negativos', () => {
    expect(daysLate('2026-11-10', '2026-11-24')).toBe(14);
    expect(daysLate('2026-11-10', '2026-11-01')).toBe(0);
  });
});

describe('validateTerms', () => {
  it('aceita termos válidos', () => {
    expect(validateTerms(base)).toEqual([]);
  });

  it.each([
    [{ billingType: 'x' }],
    [{ pricePerVehicle: -1 }],
    [{ dueDay: 29 }],
    [{ maxUsers: 0 }],
    [{ modules: ['inexistente'] }],
    [{ modules: ['monitoramento', 'monitoramento'] }],
    [{ included: 1.5 }],
  ])('rejeita %j', (patch) => {
    expect(validateTerms({ ...base, ...(patch as Partial<ContractTerms>) }).length).toBeGreaterThan(0);
  });
});
