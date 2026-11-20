import { describe, expect, it } from 'vitest';
import { corsOrigin } from './cors';

describe('corsOrigin', () => {
  it('libera só a origem da APP_URL, sem caminho nem barra final', () => {
    expect(corsOrigin('https://app.lclfleet.com/')).toBe('https://app.lclfleet.com');
    expect(corsOrigin('https://app.lclfleet.com/painel')).toBe('https://app.lclfleet.com');
    expect(corsOrigin('http://localhost:5174')).toBe('http://localhost:5174');
  });

  it('sem APP_URL ou com valor inválido não libera origem cruzada (nunca "*")', () => {
    expect(corsOrigin(undefined)).toBe(false);
    expect(corsOrigin('')).toBe(false);
    expect(corsOrigin('   ')).toBe(false);
    expect(corsOrigin('não é url')).toBe(false);
  });
});
