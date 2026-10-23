import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { RequestAuth } from './auth.guard';
import { SuperadminGuard } from './superadmin.guard';

function makeContext(auth: RequestAuth | undefined): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ auth }) }) } as unknown as ExecutionContext;
}

describe('SuperadminGuard', () => {
  const guard = new SuperadminGuard();

  it('autoriza token de superadmin', () => {
    expect(guard.canActivate(makeContext({ userId: 'sa1', clientId: null, role: 'superadmin' }))).toBe(true);
  });

  it('bloqueia token de usuário de cliente, mesmo admin', () => {
    expect(() => guard.canActivate(makeContext({ userId: 'u1', clientId: 'c1', role: 'admin' }))).toThrow(
      ForbiddenException,
    );
  });

  it('bloqueia requisição sem auth resolvido', () => {
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
