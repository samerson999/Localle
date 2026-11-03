import { describe, expect, it } from 'vitest';
import { needAge, needIcon } from './needs';

describe('needAge', () => {
  const now = new Date(2026, 10, 2, 12, 0).getTime();
  const MIN = 60000;
  it('minutos até 1 h, nunca "há 0 min"', () => {
    expect(needAge(now, now)).toBe('há 1 min');
    expect(needAge(now - 59 * MIN, now)).toBe('há 59 min');
  });
  it('horas até 48 h; depois, dias', () => {
    expect(needAge(now - 60 * MIN, now)).toBe('há 1 h');
    expect(needAge(now - 47 * 60 * MIN, now)).toBe('há 47 h');
    expect(needAge(now - 48 * 60 * MIN, now)).toBe('há 2 dias');
  });
  it('sem data fica vazio', () => {
    expect(needAge(undefined, now)).toBe('');
  });
});

describe('needIcon', () => {
  it('cada tipo tem seu ícone', () => {
    expect(needIcon('pneu')).toBe('pneus');
    expect(needIcon('os')).toBe('manutencao');
  });
});
