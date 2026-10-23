import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Role } from '../auth/jwt';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { getPermissionDefinition, listPermissionDefinitions } from './permission-definitions';
import { PermissionsRepository } from './permissions.repository';

export interface ResolvedPermission {
  key: string;
  label: string;
  role: Role;
  allowed: boolean;
  origin: 'cliente' | 'padrao';
  editableByClient: boolean;
}

/** Papéis que um Admin de cliente pode editar permissão — nunca o próprio `admin` (requisito 2). */
const EDITABLE_ROLES: Role[] = ['gestor', 'operador'];

@Injectable()
export class PermissionsService {
  constructor(
    private readonly repo: PermissionsRepository,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * Usado pelo `PermissionsGuard` para autorizar uma requisição — nunca falha por chave desconhecida
   * (trata como não permitido, não como erro de rota), porque uma chave removida do catálogo não pode
   * virar um 500 em produção; só `resolve`/`set` administrativos (chamados com chave explícita de quem
   * está configurando) tratam chave desconhecida como erro.
   */
  async isAllowed(clientId: string, role: Role, key: string): Promise<boolean> {
    const def = getPermissionDefinition(key);
    if (!def) return false;
    const override = await this.repo.findOverride(clientId, role, key);
    return override ?? def.defaultByRole[role];
  }

  async resolveAll(clientId: string): Promise<ResolvedPermission[]> {
    const overrides = await this.repo.findAllOverrides(clientId);
    const out: ResolvedPermission[] = [];
    for (const def of listPermissionDefinitions()) {
      for (const role of ['admin', 'gestor', 'operador'] as const) {
        const override = overrides[role][def.key];
        out.push({
          key: def.key,
          label: def.label,
          role,
          allowed: override ?? def.defaultByRole[role],
          origin: override === undefined ? 'padrao' : 'cliente',
          editableByClient: def.editableByClient,
        });
      }
    }
    return out;
  }

  async set(
    clientId: string,
    role: Role,
    key: string,
    allowed: boolean,
    actingUserId: string,
  ): Promise<ResolvedPermission> {
    const def = getPermissionDefinition(key);
    if (!def) throw new NotFoundException(`Permissão "${key}" não existe`);
    if (!EDITABLE_ROLES.includes(role)) {
      throw new ForbiddenException('Permissões do papel "admin" não podem ser alteradas pelo cliente');
    }
    if (!def.editableByClient) {
      throw new ForbiddenException(`Permissão "${key}" é travada pela plataforma e não pode ser alterada`);
    }

    // Achado #4 (mutação + auditoria atômicas) e #5 (serialização real por chave lógica — ver
    // `lockOverrideKey`, corrige o caso em que a linha ainda não existe e `FOR UPDATE` não ajuda) da
    // auditoria de 23/10/2026 — tudo numa transação.
    await withTransaction(this.pool, async (client) => {
      await this.repo.lockOverrideKey(client, clientId, role, key);
      const before = await this.repo.findOverride(clientId, role, key, client, true);
      await this.repo.setOverride(clientId, role, key, allowed, actingUserId, client);
      await this.audit.record(
        {
          actorType: 'user',
          actorId: actingUserId,
          clientId,
          action: 'permission.set',
          target: `${role}:${key}`,
          before: { allowed: before ?? def.defaultByRole[role] },
          after: { allowed },
        },
        client,
      );
    });

    return { key: def.key, label: def.label, role, allowed, origin: 'cliente', editableByClient: true };
  }

  async restoreDefault(clientId: string, role: Role, key: string, actingUserId: string): Promise<ResolvedPermission> {
    const def = getPermissionDefinition(key);
    if (!def) throw new NotFoundException(`Permissão "${key}" não existe`);
    if (!EDITABLE_ROLES.includes(role)) {
      throw new ForbiddenException('Permissões do papel "admin" não podem ser alteradas pelo cliente');
    }
    if (!def.editableByClient) {
      throw new ForbiddenException(`Permissão "${key}" é travada pela plataforma e não pode ser alterada`);
    }

    await withTransaction(this.pool, async (client) => {
      await this.repo.lockOverrideKey(client, clientId, role, key);
      const before = await this.repo.findOverride(clientId, role, key, client, true);
      await this.repo.clearOverride(clientId, role, key, client);
      await this.audit.record(
        {
          actorType: 'user',
          actorId: actingUserId,
          clientId,
          action: 'permission.restore_default',
          target: `${role}:${key}`,
          before: { allowed: before ?? def.defaultByRole[role] },
          after: { allowed: def.defaultByRole[role] },
        },
        client,
      );
    });

    return {
      key: def.key,
      label: def.label,
      role,
      allowed: def.defaultByRole[role],
      origin: 'padrao',
      editableByClient: true,
    };
  }
}
