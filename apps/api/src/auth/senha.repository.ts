import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { Role } from './jwt';

export interface RedefinicaoAberta {
  id: string;
  user_id: string;
  client_id: string;
  email: string;
  role: Role;
  token_hash: string;
}

/**
 * Acesso a `senha_redefinicoes` e à senha do usuário. Como `UsersRepository`, não estende
 * `BaseRepository`: o pedido de redefinição chega por e-mail, antes de haver `client_id` — ele sai do
 * próprio usuário/token. `trocarSenha` recebe `clientId` explícito e o aplica no `where`.
 */
@Injectable()
export class SenhaRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Quantos pedidos este usuário fez na última hora — limite de abuso por conta. */
  async pedidosNaUltimaHora(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      "select count(*)::int as n from senha_redefinicoes where user_id = $1 and criado_em > now() - interval '1 hour'",
      [userId],
    );
    return rows[0].n;
  }

  /** Revoga os anteriores ainda abertos e grava o novo (só o hash). */
  async emitir(executor: Queryable, data: { userId: string; clientId: string; tokenHash: string; validadeMin: number }): Promise<void> {
    await executor.query('update senha_redefinicoes set revogado_em = now() where user_id = $1 and usado_em is null and revogado_em is null', [
      data.userId,
    ]);
    await executor.query(
      `insert into senha_redefinicoes (user_id, client_id, token_hash, expira_em)
       values ($1, $2, $3, now() + make_interval(mins => $4))`,
      [data.userId, data.clientId, data.tokenHash, data.validadeMin],
    );
  }

  /** O pedido aberto mais recente da conta deste e-mail (o código é conferido no service). */
  async abertaPorEmail(executor: Queryable, email: string, lock = false): Promise<RedefinicaoAberta | null> {
    const { rows } = await executor.query<RedefinicaoAberta>(
      `select r.id, r.user_id, r.client_id, r.token_hash, u.email, u.role
         from senha_redefinicoes r join users u on u.id = r.user_id
        where u.email = $1 and r.usado_em is null and r.revogado_em is null and r.expira_em > now()
          and u.desativado_em is null
        order by r.criado_em desc limit 1
        ${lock ? 'for update of r' : ''}`,
      [email],
    );
    return rows[0] ?? null;
  }

  /** Código errado: conta a tentativa e revoga o pedido ao chegar no limite. Devolve quantas já foram. */
  async registrarErro(executor: Queryable, id: string, max: number): Promise<number> {
    const { rows } = await executor.query<{ tentativas: number }>(
      `update senha_redefinicoes set tentativas = tentativas + 1,
              revogado_em = case when tentativas + 1 >= $2 then now() end
        where id = $1 returning tentativas`,
      [id, max],
    );
    return rows[0].tentativas;
  }

  async marcarUsada(executor: Queryable, id: string): Promise<void> {
    await executor.query('update senha_redefinicoes set usado_em = now() where id = $1', [id]);
  }

  async definirSenha(executor: Queryable, userId: string, passwordHash: string): Promise<void> {
    await executor.query(
      'update users set password_hash = $2, email_confirmado_em = coalesce(email_confirmado_em, now()), senha_alterada_em = now(), updated_at = now() where id = $1',
      [userId, passwordHash],
    );
  }

  async trocarSenha(executor: Queryable, clientId: string, userId: string, passwordHash: string): Promise<boolean> {
    const { rowCount } = await executor.query(
      'update users set password_hash = $3, senha_alterada_em = now(), updated_at = now() where client_id = $1 and id = $2',
      [clientId, userId, passwordHash],
    );
    return (rowCount ?? 0) > 0;
  }
}
