import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { SimCardEntity } from './sim-card.entity';

/** `sim_cards` também pertence à Locale (sem `client_id`) — mesmo raciocínio de `RastreadoresRepository`. */
@Injectable()
export class SimCardsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<SimCardEntity[]> {
    const { rows } = await this.pool.query<SimCardEntity>('select * from sim_cards order by criado_em desc');
    return rows;
  }

  async findById(id: string): Promise<SimCardEntity | null> {
    const { rows } = await this.pool.query<SimCardEntity>('select * from sim_cards where id = $1', [id]);
    return rows[0] ?? null;
  }

  async create(
    data: { iccid: string; operadora?: string | null; numero?: string | null },
    executor: Queryable = this.pool,
  ): Promise<SimCardEntity> {
    const { rows } = await executor.query<SimCardEntity>(
      `insert into sim_cards (iccid, operadora, numero) values ($1, $2, $3) returning *`,
      [data.iccid, data.operadora ?? null, data.numero ?? null],
    );
    return rows[0];
  }

  async vincular(id: string, rastreadorId: string, executor: Queryable = this.pool): Promise<SimCardEntity> {
    const { rows } = await executor.query<SimCardEntity>(
      `update sim_cards set rastreador_id = $1, status = 'ativo', atualizado_em = now() where id = $2 returning *`,
      [rastreadorId, id],
    );
    return rows[0];
  }

  async desvincular(id: string, executor: Queryable = this.pool): Promise<SimCardEntity> {
    const { rows } = await executor.query<SimCardEntity>(
      `update sim_cards set rastreador_id = null, status = 'inativo', atualizado_em = now() where id = $1 returning *`,
      [id],
    );
    return rows[0];
  }
}
