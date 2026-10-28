import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lerVisao, salvarVisao, VISAO_PADRAO } from './monitorPrefs';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
});

describe('preferência de visão do Monitoramento por usuário', () => {
  it('cada usuário guarda a sua; sem nada salvo, cards ligados e tabela desligada', () => {
    expect(lerVisao('a@x.com')).toEqual(VISAO_PADRAO);
    salvarVisao('a@x.com', { cards: true, tabela: true });
    salvarVisao('B@x.com', { cards: false, tabela: true });
    expect(lerVisao('a@x.com')).toEqual({ cards: true, tabela: true });
    expect(lerVisao('b@x.com')).toEqual({ cards: false, tabela: true }); // e-mail sem diferença de maiúsculas
  });

  it('as duas desligadas ou valor corrompido voltam ao padrão', () => {
    salvarVisao('a@x.com', { cards: false, tabela: false });
    expect(lerVisao('a@x.com')).toEqual(VISAO_PADRAO);
    mem.set('monitor.visao.c@x.com', '{lixo');
    expect(lerVisao('c@x.com')).toEqual(VISAO_PADRAO);
  });

  it('sem armazenamento disponível não quebra a tela', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } });
    expect(lerVisao('a@x.com')).toEqual(VISAO_PADRAO);
    expect(() => salvarVisao('a@x.com', { cards: false, tabela: true })).not.toThrow();
  });
});
