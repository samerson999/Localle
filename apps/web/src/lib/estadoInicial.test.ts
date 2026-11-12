import { describe, expect, it } from 'vitest';
import { estadoInicial, estadoSemCliente } from './estadoInicial';

// Bug da HML (12/11/2026): o store vai inteiro para o localStorage e login/logout só trocavam a `session` —
// quem entrava no cliente B no mesmo navegador via os rastreadores do cliente A.
describe('estadoSemCliente', () => {
  const doClienteA = {
    ...estadoInicial(),
    session: { email: 'a@a.com', role: 'gestor' },
    assets: [{ id: 'lc_a1', plate: 'AAA1A11' }],
    vehicles: { lc_a1: { pos: [0, 0] } },
    history: { lc_a1: [[1, 0, 0, 0, 1]] },
    alerts: [{ id: 'al_1' }],
    shares: [{ id: 's1' }], // chave criada por tela, fora do estado inicial
    upsert: () => null,
  };

  it('não sobra nenhum dado do cliente anterior, e a nova sessão entra', () => {
    const novo = estadoSemCliente(doClienteA, { email: 'b@b.com', role: 'gestor' });
    expect(novo.assets).toEqual([]);
    expect(novo.vehicles).toEqual({});
    expect(novo.history).toEqual({});
    expect(novo.alerts).toEqual([]);
    expect('shares' in novo).toBe(false);
    expect(novo.session).toEqual({ email: 'b@b.com', role: 'gestor' });
  });

  it('mantém as ações do store e, sem sessão, fica deslogado', () => {
    const novo = estadoSemCliente(doClienteA);
    expect(novo.upsert).toBe(doClienteA.upsert);
    expect(novo.session).toBeNull();
  });
});
