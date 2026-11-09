import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard';
import { signAuthToken } from './jwt';

function makeContext(token: string | null): ExecutionContext {
  // mesmo objeto de request em toda chamada: o guard escreve `request.auth`, e o teste precisa ler essa
  // mesma mutação depois — `getRequest()` recriando o objeto a cada vez perderia essa escrita.
  const request = { headers: { authorization: token ? `Bearer ${token}` : undefined }, auth: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('AuthGuard — sessão persistente (sessionStart, sem teto de dias)', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'teste-secret';
  });

  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) } as unknown as Reflector;

  it('rejeita sem token', async () => {
    const activeUsers = { isActive: vi.fn(), isSuperadmin: vi.fn() } as any;
    const guard = new AuthGuard(reflector, activeUsers);
    await expect(guard.canActivate(makeContext(null))).rejects.toThrow(UnauthorizedException);
  });

  it('token válido e sessão dentro do teto: autoriza e passa o iat certo para isActive', async () => {
    const token = signAuthToken({ sub: 'u1', clientId: 'c1', role: 'gestor' });
    const isActive = vi.fn().mockResolvedValue(true);
    const activeUsers = { isActive, isSuperadmin: vi.fn() } as any;
    const guard = new AuthGuard(reflector, activeUsers);
    const ctx = makeContext(token);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(isActive).toHaveBeenCalledWith('u1', expect.any(Number));
    const request = ctx.switchToHttp().getRequest();
    expect(request.auth).toMatchObject({ userId: 'u1', clientId: 'c1', role: 'gestor' });
    expect(request.auth.sessionStart).toBeTypeOf('number');
  });

  it('renovação preserva sessionStart; sessão muito antiga continua autorizada (sem teto de dias — decisão do usuário)', async () => {
    const sessionStart = Math.floor(Date.now() / 1000) - 400 * 86_400; // mais de 1 ano desde o login original
    const tokenRenovado = signAuthToken({ sub: 'u1', clientId: 'c1', role: 'gestor', sessionStart });
    const isActive = vi.fn().mockResolvedValue(true);
    const activeUsers = { isActive, isSuperadmin: vi.fn() } as any;
    const guard = new AuthGuard(reflector, activeUsers);
    const ctx = makeContext(tokenRenovado);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(ctx.switchToHttp().getRequest().auth.sessionStart).toBe(sessionStart);
  });

  it('usuário desativado/senha trocada (isActive false): rejeita mesmo com token e sessão válidos', async () => {
    const token = signAuthToken({ sub: 'u1', clientId: 'c1', role: 'gestor' });
    const activeUsers = { isActive: vi.fn().mockResolvedValue(false), isSuperadmin: vi.fn() } as any;
    const guard = new AuthGuard(reflector, activeUsers);
    await expect(guard.canActivate(makeContext(token))).rejects.toThrow(UnauthorizedException);
  });
});
