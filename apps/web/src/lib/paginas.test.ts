import { describe, expect, it } from 'vitest';
import { paginaLiberada } from './paginas';

describe('paginaLiberada', () => {
  it('página sem registro nasce liberada se o módulo está ligado', () => {
    expect(paginaLiberada({ monitoramento: true }, '/monitoramento/replay')).toBe(true);
    expect(paginaLiberada({}, '/setup')).toBe(true);
  });
  it('módulo desligado derruba as páginas dele, mesmo marcadas', () => {
    expect(paginaLiberada({ monitoramento: false, '/inicio': true }, '/inicio')).toBe(false);
  });
  it('página desligada pela revenda', () => {
    expect(paginaLiberada({ monitoramento: true, '/monitoramento/cercas': false }, '/monitoramento/cercas')).toBe(false);
    expect(paginaLiberada({ '/setup': false }, '/setup')).toBe(false);
  });
  it('relatório individual segue o hub /relatorios', () => {
    expect(paginaLiberada({ monitoramento: true, '/relatorios': false }, '/relatorios/uso')).toBe(false);
    expect(paginaLiberada({ monitoramento: true }, '/relatorios/uso')).toBe(true);
  });
  it('rota fora do catálogo sempre liberada (ex.: Minha conta)', () => {
    expect(paginaLiberada({ '/conta': false }, '/conta')).toBe(true);
  });
});
