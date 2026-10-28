import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseInstalar } from './rastreadores-cliente.controller';

describe('parseInstalar (POST /rastreadores/:id/instalar)', () => {
  const assetId = randomUUID();

  it('aceita o mínimo (ativo + técnico) e normaliza km e data', () => {
    expect(parseInstalar({ assetId, tecnico: '  João  ' })).toEqual({ assetId, tecnico: 'João', instaladoEm: undefined, kmInicial: undefined });
    const r = parseInstalar({ assetId, tecnico: 'João', kmInicial: '12345.5', instaladoEm: '2026-10-28T10:00:00Z' });
    expect(r.kmInicial).toBe('12345.5');
    expect(r.instaladoEm?.toISOString()).toBe('2026-10-28T10:00:00.000Z');
  });

  it('recusa corpo sem ativo válido, sem técnico ou com km inválido (400 antes do banco)', () => {
    expect(() => parseInstalar({ tecnico: 'João' })).toThrow(/assetId/);
    expect(() => parseInstalar({ assetId: 'nao-uuid', tecnico: 'João' })).toThrow(/assetId/);
    expect(() => parseInstalar({ assetId, tecnico: '   ' })).toThrow(/tecnico/);
    expect(() => parseInstalar({ assetId, tecnico: 'x'.repeat(121) })).toThrow(/tecnico/);
    expect(() => parseInstalar({ assetId, tecnico: 'João', kmInicial: 'abc' })).toThrow(/kmInicial/);
    expect(() => parseInstalar({ assetId, tecnico: 'João', kmInicial: -1 })).toThrow(/kmInicial/);
    expect(() => parseInstalar(null)).toThrow();
  });
});
