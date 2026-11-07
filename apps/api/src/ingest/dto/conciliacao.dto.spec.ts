import { describe, expect, it } from 'vitest';
import { validarReexecucao } from './conciliacao.dto';

const UUID = '6f1c2b0e-8d2a-4b8e-9a51-0c1d2e3f4a5b';

describe('pedido de reexecução da conciliação', () => {
  it('aceita rastreadorId ou traccarDeviceId com período válido', () => {
    expect(validarReexecucao({ rastreadorId: UUID, de: '2026-11-01T00:00:00Z', ate: '2026-11-02T00:00:00Z' })).toEqual({
      rastreadorId: UUID, de: new Date('2026-11-01T00:00:00Z'), ate: new Date('2026-11-02T00:00:00Z'),
    });
    expect(validarReexecucao({ traccarDeviceId: 10, de: '2026-11-01T00:00:00Z', ate: '2026-11-02T00:00:00Z' }).traccarDeviceId).toBe(10);
  });

  it('exige exatamente um identificador válido', () => {
    const periodo = { de: '2026-11-01T00:00:00Z', ate: '2026-11-02T00:00:00Z' };
    expect(() => validarReexecucao(periodo)).toThrow('um dos dois');
    expect(() => validarReexecucao({ ...periodo, rastreadorId: UUID, traccarDeviceId: 1 })).toThrow('um dos dois');
    expect(() => validarReexecucao({ ...periodo, rastreadorId: "1' or 1=1" })).toThrow('rastreadorId inválido');
    expect(() => validarReexecucao({ ...periodo, traccarDeviceId: 2 ** 60 })).toThrow('traccarDeviceId inválido');
  });

  it('recusa período invertido, maior que 31 dias, data inválida ou no futuro', () => {
    expect(() => validarReexecucao({ traccarDeviceId: 1, de: '2026-11-02T00:00:00Z', ate: '2026-11-01T00:00:00Z' })).toThrow('anterior');
    expect(() => validarReexecucao({ traccarDeviceId: 1, de: '2026-09-01T00:00:00Z', ate: '2026-11-01T00:00:00Z' })).toThrow('31 dias');
    expect(() => validarReexecucao({ traccarDeviceId: 1, de: 'ontem', ate: '2026-11-01T00:00:00Z' })).toThrow('datas ISO');
    const amanha = new Date(Date.now() + 86_400_000).toISOString();
    expect(() => validarReexecucao({ traccarDeviceId: 1, de: new Date().toISOString(), ate: amanha })).toThrow('futuro');
  });
});
