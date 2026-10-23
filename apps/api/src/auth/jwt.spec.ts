import { beforeAll, describe, expect, it } from 'vitest';
import { signAuthToken, verifyAuthToken } from './jwt';

describe('jwt — assinatura e verificação', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'teste-secret';
  });

  it('round-trip de token de usuário de cliente preserva clientId e role', () => {
    const token = signAuthToken({ sub: 'user-1', clientId: 'client-1', role: 'gestor' });
    const payload = verifyAuthToken(token);
    expect(payload).toMatchObject({ sub: 'user-1', clientId: 'client-1', role: 'gestor' });
  });

  it('round-trip de token de superadmin não carrega clientId', () => {
    const token = signAuthToken({ sub: 'sa-1', role: 'superadmin' });
    const payload = verifyAuthToken(token);
    expect(payload).toMatchObject({ sub: 'sa-1', role: 'superadmin' });
    expect(payload).not.toHaveProperty('clientId');
  });

  it('rejeita token com assinatura inválida (proteção contra manipulação de clientId/role)', () => {
    const token = signAuthToken({ sub: 'user-1', clientId: 'client-1', role: 'operador' });
    const [header, payload] = token.split('.');
    // troca o payload por um com role/clientId forjados, mantendo header e assinatura originais —
    // é exatamente o ataque que a verificação de assinatura tem que barrar.
    const forged = Buffer.from(JSON.stringify({ sub: 'user-1', clientId: 'client-1', role: 'admin' })).toString(
      'base64url',
    );
    const tampered = `${header}.${forged}.${token.split('.')[2]}`;
    expect(tampered).not.toBe(token);
    expect(() => verifyAuthToken(tampered)).toThrow();
  });

  it('rejeita token assinado com outro segredo', () => {
    const token = signAuthToken({ sub: 'user-1', clientId: 'client-1', role: 'admin' });
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'outro-segredo-completamente-diferente';
    try {
      expect(() => verifyAuthToken(token)).toThrow();
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });
});
