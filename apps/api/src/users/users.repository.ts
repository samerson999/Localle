import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Role } from '../auth/jwt';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { UserEntity } from './user.entity';

/** Quais veículos a pessoa vê (migration 1794490000000). `restrito: false` = a frota toda. */
export interface EscopoUsuario {
  restrito: boolean;
  semGrupo: boolean;
  grupoIds: string[];
  operacaoIds: string[];
}

export type MembroComEscopo = UserEntity & { grupo_ids: string[]; operacao_ids: string[] };

/**
 * Login busca por e-mail ou usuário sem ainda saber o `client_id` (é exatamente o que a autenticação resolve) —
 * por isso, como `ClientsRepository`, não estende `BaseRepository`. Os demais métodos recebem
 * `clientId` explícito e o aplicam no `where`/`insert`, mesma regra do `BaseRepository`. Usuário excluído
 * (`excluido_em`) não aparece em nenhuma busca daqui: só segue existindo para o histórico.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    const { rows } = await this.pool.query<UserEntity>('select * from users where email = $1 and excluido_em is null', [email]);
    return rows[0] ?? null;
  }

  /** Login: com "@" é e-mail, sem é nome de usuário. Os dois são guardados em minúsculas. */
  async findByLogin(login: string): Promise<UserEntity | null> {
    const valor = login.trim().toLowerCase();
    const coluna = valor.includes('@') ? 'email' : 'username';
    const { rows } = await this.pool.query<UserEntity>(`select * from users where ${coluna} = $1 and excluido_em is null`, [valor]);
    return rows[0] ?? null;
  }

  async findManyByClient(clientId: string): Promise<MembroComEscopo[]> {
    const { rows } = await this.pool.query<MembroComEscopo>(
      `select u.*,
         coalesce((select array_agg(g.group_id order by g.group_id) from user_escopo_grupos g where g.user_id = u.id), '{}') as grupo_ids,
         coalesce((select array_agg(o.operacao_id order by o.operacao_id) from user_escopo_operacoes o where o.user_id = u.id), '{}') as operacao_ids
       from users u where u.client_id = $1 and u.excluido_em is null order by coalesce(u.username, u.email)`,
      [clientId],
    );
    return rows;
  }

  /** `clientId` no where: um admin nunca alcança usuário de outro cliente. */
  async findOneByClient(clientId: string, id: string, executor: Queryable = this.pool): Promise<UserEntity | null> {
    const { rows } = await executor.query<UserEntity>('select * from users where client_id = $1 and id = $2 and excluido_em is null', [clientId, id]);
    return rows[0] ?? null;
  }

  async setDesativadoEm(clientId: string, id: string, desativadoEm: Date | null, executor: Queryable = this.pool): Promise<UserEntity | null> {
    const { rows } = await executor.query<UserEntity>(
      'update users set desativado_em = $3, updated_at = now() where client_id = $1 and id = $2 and excluido_em is null returning *',
      [clientId, id, desativadoEm],
    );
    return rows[0] ?? null;
  }

  /**
   * Exclusão: some da equipe e perde o acesso na hora (também desativa, então toda checagem de "ativo" já cobre),
   * mas a linha fica para o histórico. Códigos e convites abertos deixam de valer.
   */
  async excluir(clientId: string, id: string, executor: Queryable = this.pool): Promise<boolean> {
    const { rowCount } = await executor.query(
      `update users set excluido_em = now(), desativado_em = coalesce(desativado_em, now()), updated_at = now()
        where client_id = $1 and id = $2 and excluido_em is null`,
      [clientId, id],
    );
    if (!rowCount) return false;
    await executor.query('update convites set revogado_em = now() where user_id = $1 and usado_em is null and revogado_em is null', [id]);
    await executor.query('update senha_redefinicoes set revogado_em = now() where user_id = $1 and usado_em is null and revogado_em is null', [id]);
    await executor.query('update email_confirmacoes set revogado_em = now() where user_id = $1 and usado_em is null and revogado_em is null', [id]);
    await executor.query('delete from notificacao_aparelhos where user_id = $1', [id]);
    return true;
  }

  /**
   * Senha definida por outra pessoa (superadmin ou admin do cliente): `senha_alterada_em` derruba as sessões abertas e
   * convites ainda abertos deixam de valer — senão o código antigo trocaria de novo a senha recém-definida.
   */
  async definirSenha(clientId: string, id: string, passwordHash: string, executor: Queryable = this.pool): Promise<boolean> {
    const { rowCount } = await executor.query(
      `update users set password_hash = $3, email_confirmado_em = case when email is null then null else coalesce(email_confirmado_em, now()) end,
              senha_alterada_em = now(), updated_at = now()
        where client_id = $1 and id = $2 and excluido_em is null`,
      [clientId, id, passwordHash],
    );
    if (!rowCount) return false;
    await executor.query('update convites set revogado_em = now() where user_id = $1 and usado_em is null and revogado_em is null', [id]);
    return true;
  }

  async create(
    data: { clientId: string; email?: string | null; username?: string | null; passwordHash: string | null; role: Role; perfilId?: string | null },
    executor: Queryable = this.pool,
  ): Promise<UserEntity> {
    const { rows } = await executor.query<UserEntity>(
      'insert into users (client_id, email, username, password_hash, role, perfil_id) values ($1, $2, $3, $4, $5, $6) returning *',
      [data.clientId, data.email ?? null, data.username ?? null, data.passwordHash, data.role, data.perfilId ?? null],
    );
    return rows[0];
  }

  /** Papel e perfil andam juntos: o papel é o papel-base do perfil (FK composta barra perfil de outro cliente). */
  async setPerfil(clientId: string, id: string, role: Role, perfilId: string | null, executor: Queryable = this.pool): Promise<UserEntity | null> {
    const { rows } = await executor.query<UserEntity>(
      'update users set role = $3, perfil_id = $4, updated_at = now() where client_id = $1 and id = $2 and excluido_em is null returning *',
      [clientId, id, role, perfilId],
    );
    return rows[0] ?? null;
  }

  async escopo(clientId: string, id: string, executor: Queryable = this.pool): Promise<EscopoUsuario | null> {
    const { rows } = await executor.query<{ escopo_restrito: boolean; escopo_sem_grupo: boolean; grupo_ids: string[]; operacao_ids: string[] }>(
      `select u.escopo_restrito, u.escopo_sem_grupo,
         coalesce((select array_agg(g.group_id order by g.group_id) from user_escopo_grupos g where g.user_id = u.id), '{}') as grupo_ids,
         coalesce((select array_agg(o.operacao_id order by o.operacao_id) from user_escopo_operacoes o where o.user_id = u.id), '{}') as operacao_ids
       from users u where u.client_id = $1 and u.id = $2`,
      [clientId, id],
    );
    const r = rows[0];
    return r ? { restrito: r.escopo_restrito, semGrupo: r.escopo_sem_grupo, grupoIds: r.grupo_ids, operacaoIds: r.operacao_ids } : null;
  }

  /**
   * Substitui o escopo. `insert ... select` com `client_id` nas duas pontas: grupo ou operação de outro cliente
   * simplesmente não entra (sem IDOR por id); a FK composta é a segunda barreira. Chamar dentro de transação.
   */
  async definirEscopo(clientId: string, id: string, e: EscopoUsuario, executor: Queryable): Promise<void> {
    await executor.query('update users set escopo_restrito = $3, escopo_sem_grupo = $4, updated_at = now() where client_id = $1 and id = $2', [
      clientId,
      id,
      e.restrito,
      e.restrito && e.semGrupo,
    ]);
    await executor.query('delete from user_escopo_grupos where client_id = $1 and user_id = $2', [clientId, id]);
    await executor.query('delete from user_escopo_operacoes where client_id = $1 and user_id = $2', [clientId, id]);
    if (!e.restrito) return;
    if (e.grupoIds.length) {
      await executor.query(
        `insert into user_escopo_grupos (user_id, client_id, group_id)
         select $2, $1, g.id from asset_groups g where g.client_id = $1 and g.id = any($3::uuid[])`,
        [clientId, id, e.grupoIds],
      );
    }
    if (e.operacaoIds.length) {
      await executor.query(
        `insert into user_escopo_operacoes (user_id, client_id, operacao_id)
         select $2, $1, o.id from operacoes o where o.client_id = $1 and o.id = any($3::uuid[])`,
        [clientId, id, e.operacaoIds],
      );
    }
  }

  /** E-mail confirmado no primeiro acesso (`EmailService`). */
  async definirEmail(clientId: string, id: string, email: string, executor: Queryable): Promise<void> {
    await executor.query('update users set email = $3, email_confirmado_em = now(), updated_at = now() where client_id = $1 and id = $2', [clientId, id, email]);
  }
}
