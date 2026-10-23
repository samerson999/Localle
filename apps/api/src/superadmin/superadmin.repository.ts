import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { SuperadminEntity } from './superadmin.entity';

/** Tabela própria, sem `client_id` — superadmin está fora da hierarquia de clientes de propósito. */
@Injectable()
export class SuperadminRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<SuperadminEntity | null> {
    const { rows } = await this.pool.query<SuperadminEntity>('select * from superadmins where email = $1', [email]);
    return rows[0] ?? null;
  }
}
