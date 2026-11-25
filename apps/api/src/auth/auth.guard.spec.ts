import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { API_PUBLICA_KEY } from '../api-publica/auth/metadata';
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
    const activeUsers = { situacao: vi.fn(), isSuperadmin: vi.fn() } as any;
    const guard = new AuthGuard(reflector, activeUsers);
    await expect(guard.canActivate(makeContext(null))).rejects.toThrow(UnauthorizedException);
  });

  it('token válido e sessão dentro do teto: autoriza e passa o iat certo para situacao', async () => {
    const token = signAuthToken({ sub: 'u1', clientId: 'c1', role: 'gestor' });
    const situacao = vi.fn().mockResolvedValue({ escopoRestrito: false });
    const activeUsers = { situacao, isSuperadmin: vi.fn() } as any;
    const guard = new AuthGuard(reflector, activeUsers);
    const ctx = makeContext(token);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(situacao).toHaveBeenCalledWith('u1', expect.any(Number));
    const request = ctx.switchToHttp().getRequest();
    expect(request.auth).toMatchObject({ userId: 'u1', clientId: 'c1', role: 'gestor' });
    expect(request.auth.sessionStart).toBeTypeOf('number');
    expect(request.auth.ativos).toBeNull();
  });

  it('renovação preserva sessionStart; sessão muito antiga continua autorizada (sem teto de dias — decisão do usuário)', async () => {
    const sessionStart = Math.floor(Date.now() / 1000) - 400 * 86_400; // mais de 1 ano desde o login original
    const tokenRenovado = signAuthToken({ sub: 'u1', clientId: 'c1', role: 'gestor', sessionStart });
    const situacao = vi.fn().mockResolvedValue({ escopoRestrito: false });
    const activeUsers = { situacao, isSuperadmin: vi.fn() } as any;
    const guard = new AuthGuard(reflector, activeUsers);
    const ctx = makeContext(tokenRenovado);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(ctx.switchToHttp().getRequest().auth.sessionStart).toBe(sessionStart);
  });

  it('usuário desativado/senha trocada (situacao null): rejeita mesmo com token e sessão válidos', async () => {
    const token = signAuthToken({ sub: 'u1', clientId: 'c1', role: 'gestor' });
    const activeUsers = { situacao: vi.fn().mockResolvedValue(null), isSuperadmin: vi.fn() } as any;
    const guard = new AuthGuard(reflector, activeUsers);
    await expect(guard.canActivate(makeContext(token))).rejects.toThrow(UnauthorizedException);
  });

  it('usuário com escopo restrito: anexa os veículos que ele vê, consultados a cada requisição', async () => {
    const token = signAuthToken({ sub: 'u1', clientId: 'c1', role: 'operador' });
    const ativosVisiveis = vi.fn().mockResolvedValue(['a1', 'a2']);
    const activeUsers = { situacao: vi.fn().mockResolvedValue({ escopoRestrito: true }), ativosVisiveis, isSuperadmin: vi.fn() } as any;
    const ctx = makeContext(token);
    expect(await new AuthGuard(reflector, activeUsers).canActivate(ctx)).toBe(true);
    expect(ativosVisiveis).toHaveBeenCalledWith('c1', 'u1');
    expect([...ctx.switchToHttp().getRequest().auth.ativos]).toEqual(['a1', 'a2']);
  });
});

describe('AuthGuard — rotas da API pública', () => {
  it('rota @ApiPublica() fica para o ApiChaveGuard: passa sem JWT e não consulta usuário', async () => {
    const reflector = { getAllAndOverride: vi.fn((key: string) => (key === API_PUBLICA_KEY ? 'frota' : undefined)) } as unknown as Reflector;
    const activeUsers = { situacao: vi.fn(), isSuperadmin: vi.fn() } as any;
    const ctx = makeContext(null);
    expect(await new AuthGuard(reflector, activeUsers).canActivate(ctx)).toBe(true);
    expect(ctx.switchToHttp().getRequest().auth).toBeUndefined();
    expect(activeUsers.situacao).not.toHaveBeenCalled();
  });
});
