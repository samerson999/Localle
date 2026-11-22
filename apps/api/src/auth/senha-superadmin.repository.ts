import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';

export interface RedefinicaoSuperadminAberta {
  id: string;
  superadmin_id: string;
  email: string;
  token_hash: string;
}

/**
 * "Esqueci minha senha" da equipe da Localle: `superadmin_senha_redefinicoes` e a senha em `superadmins`. Mesmo
 * desenho de `SenhaRepository`, sem `client_id` — superadmin está fora da hierarquia de clientes.
 */
@Injectable()
export class SenhaSuperadminRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async ativoPorEmail(email: string): Promise<{ id: string; email: string } | null> {
    const { rows } = await this.pool.query<{ id: string; email: string }>(
      'select id, email from superadmins where email = $1 and desativado_em is null',
      [email],
    );
    return rows[0] ?? null;
  }

  async pedidosNaUltimaHora(superadminId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      "select count(*)::int as n from superadmin_senha_redefinicoes where superadmin_id = $1 and criado_em > now() - interval '1 hour'",
      [superadminId],
    );
    return rows[0].n;
  }

  /** Revoga os anteriores ainda abertos e grava o novo (só o HMAC). */
  async emitir(executor: Queryable, data: { superadminId: string; tokenHash: string; validadeMin: number }): Promise<void> {
    await executor.query(
      'update superadmin_senha_redefinicoes set revogado_em = now() where superadmin_id = $1 and usado_em is null and revogado_em is null',
      [data.superadminId],
    );
    await executor.query(
      `insert into superadmin_senha_redefinicoes (superadmin_id, token_hash, expira_em)
       values ($1, $2, now() + make_interval(mins => $3))`,
      [data.superadminId, data.tokenHash, data.validadeMin],
    );
  }

  async abertaPorEmail(executor: Queryable, email: string, lock = false): Promise<RedefinicaoSuperadminAberta | null> {
    const { rows } = await executor.query<RedefinicaoSuperadminAberta>(
      `select r.id, r.superadmin_id, r.token_hash, s.email
         from superadmin_senha_redefinicoes r join superadmins s on s.id = r.superadmin_id
        where s.email = $1 and r.usado_em is null and r.revogado_em is null and r.expira_em > now()
          and s.desativado_em is null
        order by r.criado_em desc limit 1
        ${lock ? 'for update of r' : ''}`,
      [email],
    );
    return rows[0] ?? null;
  }

  async registrarErro(executor: Queryable, id: string, max: number): Promise<number> {
    const { rows } = await executor.query<{ tentativas: number }>(
      `update superadmin_senha_redefinicoes set tentativas = tentativas + 1,
              revogado_em = case when tentativas + 1 >= $2 then now() end
        where id = $1 returning tentativas`,
      [id, max],
    );
    return rows[0].tentativas;
  }

  /** Marca o pedido como usado e grava a senha; `senha_alterada_em` derruba as sessões abertas. */
  async usarEDefinirSenha(executor: Queryable, id: string, superadminId: string, passwordHash: string): Promise<void> {
    await executor.query('update superadmin_senha_redefinicoes set usado_em = now() where id = $1', [id]);
    await executor.query('update superadmins set password_hash = $2, senha_alterada_em = now(), updated_at = now() where id = $1', [superadminId, passwordHash]);
  }
}
