import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

/**
 * Consulta mínima do `AuthGuard`: o usuário do token ainda existe e não foi desativado? Fica aqui (e não
 * em `UsersRepository`) para `AuthGuardsModule` continuar sem importar `UsersModule` — ver o achado #7 em
 * `auth-guards.module.ts`. Busca por PK, uma por requisição autenticada.
 */
@Injectable()
export class ActiveUserRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Ativo = não desativado e o contrato do cliente não está suspenso/cancelado (decidido em 24/10/2026: a
   * suspensão corta o acesso na hora, inclusive de token já emitido). Cliente sem contrato (implantação)
   * continua acessando. Mesma consulta por PK de antes, com um join a mais pelo `client_id` (unique).
   */
  async isActive(userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `select 1 from users u
         left join contratos c on c.client_id = u.client_id
        where u.id = $1 and u.desativado_em is null and (c.status is null or c.status not in ('suspenso', 'cancelado'))`,
      [userId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Para o login: o cliente está com o contrato suspenso/cancelado? */
  async isClientBlocked(clientId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `select 1 from contratos where client_id = $1 and status in ('suspenso', 'cancelado')`,
      [clientId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Superadmin removido perde o acesso na hora, não só quando o token de 8h expirar. */
  async isSuperadmin(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('select 1 from superadmins where id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
