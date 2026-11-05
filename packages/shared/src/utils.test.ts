import { describe, expect, it, vi } from 'vitest';
import { brl, fmtDT, fmtT, km, num, pct, shortDT } from './utils';

// Os formatadores reaproveitam um Intl criado uma vez; a saída tem de ser a mesma do toLocale*String de antes.
const antigo = {
  brl: (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  num: (v: number, d = 0) => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }),
  fmtDT: (t: number) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  fmtT: (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
};
const valores = [0, 0.004, 0.005, 1, -1, 12.345, 999.995, 1234.5, -98765.4321, 1e6, 123456789.987];
const instantes = Array.from({ length: 200 }, (_, i) => Date.UTC(2026, 0, 1) + i * 7_919_000); // ~2h12 de passo, cruza dias e meses

describe('formatadores reaproveitados', () => {
  it('brl e num dão a mesma saída do toLocaleString', () => {
    for (const v of valores) {
      expect(brl(v)).toBe(antigo.brl(v));
      for (const d of [0, 1, 2, 3]) expect(num(v, d)).toBe(antigo.num(v, d));
    }
    expect(km(1234.6)).toBe(`${antigo.num(1235)} km`);
    expect(pct(0.1234)).toBe(`${antigo.num(12.34, 1)}%`);
  });

  it('valor ausente vira zero, como antes', () => {
    expect(brl(null as unknown as number)).toBe(antigo.brl(0));
    expect(num(undefined as unknown as number, 2)).toBe(antigo.num(0, 2));
  });

  it('fmtT e fmtDT dão a mesma saída do toLocale*String, com número ou texto ISO', () => {
    for (const t of instantes) {
      expect(fmtT(t)).toBe(antigo.fmtT(t));
      expect(fmtDT(t)).toBe(antigo.fmtDT(t));
      expect(fmtDT(new Date(t).toISOString())).toBe(antigo.fmtDT(t));
    }
  });

  it('vazio e data inválida viram "—" em vez de lançar erro', () => {
    expect(fmtT(0)).toBe('—');
    expect(fmtDT('')).toBe('—');
    expect(fmtT(NaN)).toBe('—');
    expect(fmtDT('não é data')).toBe('—');
    expect(shortDT(NaN)).toBe('—');
  });

  it('shortDT mostra só a hora hoje e dia/mês nos outros dias', () => {
    const agora = Date.now();
    expect(shortDT(agora)).toBe(antigo.fmtT(agora));
    const ontem = agora - 86_400_000 * 3;
    expect(shortDT(ontem)).toBe(`${new Date(ontem).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${antigo.fmtT(ontem)}`);
  });

  it('cria cada formatador uma vez só', async () => {
    vi.resetModules();
    const espiaD = vi.spyOn(Intl, 'DateTimeFormat');
    const espiaN = vi.spyOn(Intl, 'NumberFormat');
    const u = await import('./utils');
    for (const t of instantes) u.fmtT(t);
    for (const v of valores) { u.num(v, 1); u.num(v, 2); u.brl(v); }
    expect(espiaD).toHaveBeenCalledTimes(1);
    expect(espiaN).toHaveBeenCalledTimes(3); // casas 1 e 2 + moeda
    espiaD.mockRestore(); espiaN.mockRestore();
  });
});
