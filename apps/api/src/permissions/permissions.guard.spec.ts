import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { RequestAuth } from '../auth/auth.guard';
import { PermissionsGuard } from './permissions.guard';
import type { PermissionsService } from './permissions.service';

function makeContext(auth: RequestAuth | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('deixa passar quando a rota não declara @RequirePermission', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const permissions = { isAllowed: vi.fn() } as unknown as PermissionsService;
    const guard = new PermissionsGuard(reflector, permissions);

    const result = await guard.canActivate(makeContext({ userId: 'u1', clientId: 'c1', role: 'operador' }));
    expect(result).toBe(true);
    expect(permissions.isAllowed).not.toHaveBeenCalled();
  });

  it('bloqueia quando a permissão resolve para false', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue('ativos.editar') } as unknown as Reflector;
    const permissions = { isAllowed: vi.fn().mockResolvedValue(false) } as unknown as PermissionsService;
    const guard = new PermissionsGuard(reflector, permissions);

    await expect(guard.canActivate(makeContext({ userId: 'u1', clientId: 'c1', role: 'operador' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('autoriza quando a permissão resolve para true', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue('ativos.editar') } as unknown as Reflector;
    const permissions = { isAllowed: vi.fn().mockResolvedValue(true) } as unknown as PermissionsService;
    const guard = new PermissionsGuard(reflector, permissions);

    const result = await guard.canActivate(makeContext({ userId: 'u1', clientId: 'c1', role: 'gestor' }));
    expect(result).toBe(true);
  });

  it('correção pós-pentest de 23/10/2026: superadmin NÃO recebe autorização implícita em rota de cliente (403 explícito, sem consultar PermissionsService)', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue('permissoes.gerenciar') } as unknown as Reflector;
    const permissions = { isAllowed: vi.fn() } as unknown as PermissionsService;
    const guard = new PermissionsGuard(reflector, permissions);

    await expect(
      guard.canActivate(makeContext({ userId: 'sa1', clientId: null, role: 'superadmin' })),
    ).rejects.toThrow(ForbiddenException);
    expect(permissions.isAllowed).not.toHaveBeenCalled();
  });

  it('rejeita se a requisição não tem auth resolvido (AuthGuard não rodou)', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue('ativos.editar') } as unknown as Reflector;
    const permissions = { isAllowed: vi.fn() } as unknown as PermissionsService;
    const guard = new PermissionsGuard(reflector, permissions);

    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(ForbiddenException);
  });
});
