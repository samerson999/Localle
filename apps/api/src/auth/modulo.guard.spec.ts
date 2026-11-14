import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { RequestAuth } from './auth.guard';
import { ModuloGuard } from './modulo.guard';

function makeContext(auth: RequestAuth | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

const gestor: RequestAuth = { userId: 'u1', clientId: 'c1', role: 'gestor', sessionStart: 0 };
const reflectorCom = (modulo: string | undefined) => ({ getAllAndOverride: vi.fn().mockReturnValue(modulo) }) as unknown as Reflector;
const acessos = (modules: string[] | null) => ({ acessosDoCliente: vi.fn().mockResolvedValue({ modules, blockedPages: [] }) }) as any;

describe('ModuloGuard — módulo fora do contrato não responde', () => {
  it('módulo no contrato: autoriza e consulta o cliente do token', async () => {
    const repo = acessos(['monitoramento', 'manutencao']);
    expect(await new ModuloGuard(reflectorCom('manutencao'), repo).canActivate(makeContext(gestor))).toBe(true);
    expect(repo.acessosDoCliente).toHaveBeenCalledWith('c1');
  });

  it('módulo fora do contrato: 403', async () => {
    await expect(new ModuloGuard(reflectorCom('multas'), acessos(['monitoramento'])).canActivate(makeContext(gestor))).rejects.toThrow(ForbiddenException);
  });

  it('contrato sem nenhum módulo: 403', async () => {
    await expect(new ModuloGuard(reflectorCom('multas'), acessos([])).canActivate(makeContext(gestor))).rejects.toThrow(ForbiddenException);
  });

  it('cliente sem contrato: tudo liberado', async () => {
    expect(await new ModuloGuard(reflectorCom('multas'), acessos(null)).canActivate(makeContext(gestor))).toBe(true);
  });

  it('rota sem @Modulo e superadmin não consultam o contrato', async () => {
    const repo = acessos([]);
    expect(await new ModuloGuard(reflectorCom(undefined), repo).canActivate(makeContext(gestor))).toBe(true);
    expect(await new ModuloGuard(reflectorCom('multas'), repo).canActivate(makeContext({ userId: 's', clientId: null, role: 'superadmin', sessionStart: 0 }))).toBe(true);
    expect(repo.acessosDoCliente).not.toHaveBeenCalled();
  });
});
