import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { getPermissionDefinition, listPermissionDefinitions } from './permission-definitions';
import { PerfisRepository, type BaseRole, type PerfilRow } from './perfis.repository';
import { PermissionsRepository } from './permissions.repository';

export interface PerfilPermissao {
  key: string;
  allowed: boolean;
  origin: 'perfil' | 'padrao';
  editableByClient: boolean;
}

export interface PerfilResolvido {
  id: string;
  nome: string;
  descricao: string | null;
  baseRole: BaseRole;
  usuarios: number;
  permissoes: PerfilPermissao[];
}

const PG_UNIQUE = '23505';
const PG_FK = '23503';
const pgCode = (err: unknown) => (err as { code?: string })?.code;

/**
 * Perfis próprios do cliente (ex.: Portaria, Financeiro), além de Gestor e Operador. Nasce copiando o que está
 * valendo hoje para um papel-base ou para outro perfil — o admin parte do que conhece, não de tudo desmarcado.
 * Toda mudança vai para a auditoria na mesma transação, como em `PermissionsService`.
 */
@Injectable()
export class PerfisService {
  private readonly logger = new Logger(PerfisService.name);

  constructor(
    private readonly repo: PerfisRepository,
    private readonly roles: PermissionsRepository,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async listar(clientId: string): Promise<PerfilResolvido[]> {
    const [perfis, gravadas] = await Promise.all([this.repo.listar(clientId), this.repo.todasPermissoes(clientId)]);
    return perfis.map((p) => this.resolver(p, gravadas[p.id] ?? {}));
  }

  async criar(
    clientId: string,
    actingUserId: string,
    data: { nome: string; descricao: string | null; copiarDe: BaseRole | string },
  ): Promise<PerfilResolvido> {
    const origem = await this.permissoesDeOrigem(clientId, data.copiarDe);
    let id: string;
    try {
      id = await withTransaction(this.pool, async (client) => {
        const novo = await this.repo.criar(client, { clientId, nome: data.nome, descricao: data.descricao, baseRole: origem.baseRole, criadoPor: actingUserId });
        for (const def of listPermissionDefinitions()) {
          if (def.editableByClient) await this.repo.definirPermissao(clientId, novo, def.key, origem.permissoes[def.key], actingUserId, client);
        }
        await this.audit.record(
          { actorType: 'user', actorId: actingUserId, clientId, action: 'perfil.criar', target: novo, after: { nome: data.nome, baseRole: origem.baseRole, copiarDe: data.copiarDe } },
          client,
        );
        return novo;
      });
    } catch (err) {
      if (pgCode(err) === PG_UNIQUE) throw new ConflictException('Já existe um perfil com este nome');
      throw err;
    }
    this.logger.log(`perfil criado perfil_id=${id} client_id=${clientId} por user_id=${actingUserId}`);
    return this.buscar(clientId, id);
  }

  async renomear(clientId: string, actingUserId: string, id: string, data: { nome: string; descricao: string | null }): Promise<PerfilResolvido> {
    const antes = await this.repo.buscar(clientId, id);
    if (!antes) throw new NotFoundException('Perfil não encontrado');
    try {
      await withTransaction(this.pool, async (client) => {
        await this.repo.renomear(clientId, id, data.nome, data.descricao, client);
        await this.audit.record(
          { actorType: 'user', actorId: actingUserId, clientId, action: 'perfil.renomear', target: id, before: { nome: antes.nome, descricao: antes.descricao }, after: data },
          client,
        );
      });
    } catch (err) {
      if (pgCode(err) === PG_UNIQUE) throw new ConflictException('Já existe um perfil com este nome');
      throw err;
    }
    return this.buscar(clientId, id);
  }

  /** Perfil com gente dentro não sai: o admin move as pessoas antes (a FK `users_perfil_fk` também barra). */
  async excluir(clientId: string, actingUserId: string, id: string): Promise<void> {
    const perfil = await this.repo.buscar(clientId, id);
    if (!perfil) throw new NotFoundException('Perfil não encontrado');
    if (perfil.usuarios > 0) throw new ConflictException('Mova as pessoas deste perfil para outro antes de excluí-lo');
    try {
      await withTransaction(this.pool, async (client) => {
        await this.repo.excluir(clientId, id, client);
        await this.audit.record({ actorType: 'user', actorId: actingUserId, clientId, action: 'perfil.excluir', target: id, before: { nome: perfil.nome } }, client);
      });
    } catch (err) {
      if (pgCode(err) === PG_FK) throw new ConflictException('Mova as pessoas deste perfil para outro antes de excluí-lo');
      throw err;
    }
    this.logger.log(`perfil excluído perfil_id=${id} client_id=${clientId} por user_id=${actingUserId}`);
  }

  /** `allowed: null` volta ao padrão do papel-base. */
  async definirPermissao(clientId: string, actingUserId: string, id: string, key: string, allowed: boolean | null): Promise<PerfilResolvido> {
    const def = getPermissionDefinition(key);
    if (!def) throw new NotFoundException(`Permissão "${key}" não existe`);
    if (!def.editableByClient) throw new ForbiddenException(`Permissão "${key}" é travada pela plataforma e não pode ser alterada`);
    const perfil = await this.repo.buscar(clientId, id);
    if (!perfil) throw new NotFoundException('Perfil não encontrado');
    await withTransaction(this.pool, async (client) => {
      await this.repo.travar(client, clientId, id);
      const antes = (await this.repo.permissoes(clientId, id, client))[key] ?? def.defaultByRole[perfil.base_role];
      if (allowed === null) await this.repo.limparPermissao(clientId, id, key, client);
      else await this.repo.definirPermissao(clientId, id, key, allowed, actingUserId, client);
      await this.audit.record(
        {
          actorType: 'user',
          actorId: actingUserId,
          clientId,
          action: allowed === null ? 'perfil.permissao_padrao' : 'perfil.permissao',
          target: `${id}:${key}`,
          before: { allowed: antes },
          after: { allowed: allowed ?? def.defaultByRole[perfil.base_role] },
        },
        client,
      );
    });
    return this.buscar(clientId, id);
  }

  async buscar(clientId: string, id: string): Promise<PerfilResolvido> {
    const perfil = await this.repo.buscar(clientId, id);
    if (!perfil) throw new NotFoundException('Perfil não encontrado');
    return this.resolver(perfil, await this.repo.permissoes(clientId, id));
  }

  /** Para o convite e a troca de perfil: o perfil é deste cliente? Devolve o papel-base que o usuário assume. */
  async baseRoleDe(clientId: string, id: string): Promise<BaseRole> {
    const perfil = await this.repo.buscar(clientId, id);
    if (!perfil) throw new BadRequestException('Perfil não encontrado');
    return perfil.base_role;
  }

  private resolver(p: PerfilRow, gravadas: Record<string, boolean>): PerfilResolvido {
    return {
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      baseRole: p.base_role,
      usuarios: p.usuarios,
      permissoes: listPermissionDefinitions().map((def) => {
        const gravada = def.editableByClient ? gravadas[def.key] : undefined;
        return { key: def.key, allowed: gravada ?? def.defaultByRole[p.base_role], origin: gravada === undefined ? 'padrao' : 'perfil', editableByClient: def.editableByClient };
      }),
    };
  }

  private async permissoesDeOrigem(clientId: string, copiarDe: BaseRole | string): Promise<{ baseRole: BaseRole; permissoes: Record<string, boolean> }> {
    if (copiarDe === 'gestor' || copiarDe === 'operador') {
      const overrides = (await this.roles.findAllOverrides(clientId))[copiarDe];
      return { baseRole: copiarDe, permissoes: Object.fromEntries(listPermissionDefinitions().map((d) => [d.key, overrides[d.key] ?? d.defaultByRole[copiarDe]])) };
    }
    const base = await this.repo.buscar(clientId, copiarDe);
    if (!base) throw new BadRequestException('Perfil de origem não encontrado');
    const resolvido = this.resolver(base, await this.repo.permissoes(clientId, copiarDe));
    return { baseRole: base.base_role, permissoes: Object.fromEntries(resolvido.permissoes.map((x) => [x.key, x.allowed])) };
  }
}
