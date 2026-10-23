import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { ClientEntity } from './client.entity';

/**
 * `clients` é a própria âncora de `client_id` (docs/ARQUITETURA-BACKEND.md § 2.1) — não há um
 * `client_id` externo para filtrar por aqui, então este repositório não estende `BaseRepository`
 * (que existe para impor esse filtro nas tabelas de negócio escopadas por cliente). Quem acessa esta
 * tabela é só a camada administrativa (Locale/revenda), nunca o gestor de frota.
 */
@Injectable()
export class ClientsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<ClientEntity[]> {
    const { rows } = await this.pool.query<ClientEntity>('select * from clients order by name');
    return rows;
  }

  async findById(id: string): Promise<ClientEntity | null> {
    const { rows } = await this.pool.query<ClientEntity>('select * from clients where id = $1', [id]);
    return rows[0] ?? null;
  }

  async create(
    data: { name: string; revendaId?: string | null },
    executor: Queryable = this.pool,
  ): Promise<ClientEntity> {
    const { rows } = await executor.query<ClientEntity>(
      'insert into clients (name, revenda_id) values ($1, $2) returning *',
      [data.name, data.revendaId ?? null],
    );
    return rows[0];
  }
}
