import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Role } from '../auth/jwt';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { UserEntity } from './user.entity';

/**
 * Login busca por e-mail sem ainda saber o `client_id` (é exatamente o que a autenticação resolve) —
 * por isso, como `ClientsRepository`, não estende `BaseRepository`. `findManyByClient`/`create` recebem
 * `clientId` explícito e o aplicam no `where`/`insert`, mesma regra do `BaseRepository`.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    const { rows } = await this.pool.query<UserEntity>('select * from users where email = $1', [email]);
    return rows[0] ?? null;
  }

  async findManyByClient(clientId: string): Promise<UserEntity[]> {
    const { rows } = await this.pool.query<UserEntity>(
      'select * from users where client_id = $1 order by email',
      [clientId],
    );
    return rows;
  }

  /** `clientId` no where: um admin nunca alcança usuário de outro cliente. */
  async findOneByClient(clientId: string, id: string, executor: Queryable = this.pool): Promise<UserEntity | null> {
    const { rows } = await executor.query<UserEntity>('select * from users where client_id = $1 and id = $2', [clientId, id]);
    return rows[0] ?? null;
  }

  async setDesativadoEm(clientId: string, id: string, desativadoEm: Date | null, executor: Queryable = this.pool): Promise<UserEntity | null> {
    const { rows } = await executor.query<UserEntity>(
      'update users set desativado_em = $3, updated_at = now() where client_id = $1 and id = $2 returning *',
      [clientId, id, desativadoEm],
    );
    return rows[0] ?? null;
  }

  async create(
    data: { clientId: string; email: string; passwordHash: string | null; role: Role },
    executor: Queryable = this.pool,
  ): Promise<UserEntity> {
    const { rows } = await executor.query<UserEntity>(
      'insert into users (client_id, email, password_hash, role) values ($1, $2, $3, $4) returning *',
      [data.clientId, data.email, data.passwordHash, data.role],
    );
    return rows[0];
  }
}
