import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { Role } from '../auth/jwt';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';

export type BaseRole = Exclude<Role, 'admin'>;

export interface PerfilRow {
  id: string;
  client_id: string;
  nome: string;
  descricao: string | null;
  base_role: BaseRole;
  criado_em: Date;
  usuarios: number;
}

/**
 * Perfis de acesso próprios do cliente e as permissões de cada um (migration 1794430000000). Mesma regra de
 * `PermissionsRepository`: `client_id` é sempre o primeiro filtro — perfil de outro cliente é "não encontrado".
 */
@Injectable()
export class PerfisRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listar(clientId: string): Promise<PerfilRow[]> {
    const { rows } = await this.pool.query<PerfilRow>(
      `select p.id, p.client_id, p.nome, p.descricao, p.base_role, p.criado_em,
              (select count(*)::int from users u where u.client_id = p.client_id and u.perfil_id = p.id) as usuarios
         from perfis p where p.client_id = $1 order by lower(p.nome)`,
      [clientId],
    );
    return rows;
  }

  async buscar(clientId: string, id: string, executor: Queryable = this.pool): Promise<PerfilRow | null> {
    const { rows } = await executor.query<PerfilRow>(
      `select p.id, p.client_id, p.nome, p.descricao, p.base_role, p.criado_em,
              (select count(*)::int from users u where u.client_id = p.client_id and u.perfil_id = p.id) as usuarios
         from perfis p where p.client_id = $1 and p.id = $2`,
      [clientId, id],
    );
    return rows[0] ?? null;
  }

  async criar(
    client: PoolClient,
    data: { clientId: string; nome: string; descricao: string | null; baseRole: BaseRole; criadoPor: string },
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into perfis (client_id, nome, descricao, base_role, criado_por) values ($1, $2, $3, $4, $5) returning id`,
      [data.clientId, data.nome, data.descricao, data.baseRole, data.criadoPor],
    );
    return rows[0].id;
  }

  async renomear(clientId: string, id: string, nome: string, descricao: string | null, executor: Queryable = this.pool): Promise<boolean> {
    const { rowCount } = await executor.query(
      `update perfis set nome = $3, descricao = $4, atualizado_em = now() where client_id = $1 and id = $2`,
      [clientId, id, nome, descricao],
    );
    return (rowCount ?? 0) > 0;
  }

  async excluir(clientId: string, id: string, executor: Queryable = this.pool): Promise<boolean> {
    const { rowCount } = await executor.query('delete from perfis where client_id = $1 and id = $2', [clientId, id]);
    return (rowCount ?? 0) > 0;
  }

  /** Permissões gravadas do perfil (o que não está aqui segue o padrão do papel-base). */
  async permissoes(clientId: string, perfilId: string, executor: Queryable = this.pool): Promise<Record<string, boolean>> {
    const { rows } = await executor.query<{ permission_key: string; allowed: boolean }>(
      'select permission_key, allowed from perfil_permissoes where client_id = $1 and perfil_id = $2',
      [clientId, perfilId],
    );
    return Object.fromEntries(rows.map((r) => [r.permission_key, r.allowed]));
  }

  async todasPermissoes(clientId: string): Promise<Record<string, Record<string, boolean>>> {
    const { rows } = await this.pool.query<{ perfil_id: string; permission_key: string; allowed: boolean }>(
      'select perfil_id, permission_key, allowed from perfil_permissoes where client_id = $1',
      [clientId],
    );
    const out: Record<string, Record<string, boolean>> = {};
    for (const r of rows) (out[r.perfil_id] ??= {})[r.permission_key] = r.allowed;
    return out;
  }

  async definirPermissao(
    clientId: string,
    perfilId: string,
    key: string,
    allowed: boolean,
    updatedBy: string,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `insert into perfil_permissoes (client_id, perfil_id, permission_key, allowed, updated_by) values ($1, $2, $3, $4, $5)
       on conflict (perfil_id, permission_key) do update set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = now()`,
      [clientId, perfilId, key, allowed, updatedBy],
    );
  }

  async limparPermissao(clientId: string, perfilId: string, key: string, executor: Queryable = this.pool): Promise<void> {
    await executor.query('delete from perfil_permissoes where client_id = $1 and perfil_id = $2 and permission_key = $3', [clientId, perfilId, key]);
  }

  async travar(client: PoolClient, clientId: string, perfilId: string): Promise<void> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`perfil:${clientId}:${perfilId}`]);
  }

  /** Papel e perfil atuais do usuário — lidos do banco, nunca do token (troca de perfil vale na hora). */
  async acessoDoUsuario(clientId: string, userId: string): Promise<{ role: Role; perfil_id: string | null } | null> {
    const { rows } = await this.pool.query<{ role: Role; perfil_id: string | null }>(
      'select role, perfil_id from users where client_id = $1 and id = $2',
      [clientId, userId],
    );
    return rows[0] ?? null;
  }
}
