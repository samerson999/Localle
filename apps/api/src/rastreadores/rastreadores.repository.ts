import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { RastreadorEntity } from './rastreador.entity';

/**
 * `rastreadores` não tem `client_id` (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.1: o dono num dado
 * momento é resolvido via `instalacoes`, nunca fixo aqui) — por isso este repositório não estende
 * `BaseRepository`, mesmo raciocínio de `ClientsRepository`. Só a camada administrativa (superadmin)
 * acessa esta tabela diretamente.
 */
@Injectable()
export class RastreadoresRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<RastreadorEntity[]> {
    const { rows } = await this.pool.query<RastreadorEntity>(
      'select * from rastreadores order by criado_em desc',
    );
    return rows;
  }

  async findById(id: string): Promise<RastreadorEntity | null> {
    const { rows } = await this.pool.query<RastreadorEntity>(
      'select * from rastreadores where id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    data: { imei: string; traccarDeviceId?: string | null; modelo?: string | null; protocolo?: string | null },
    executor: Queryable = this.pool,
  ): Promise<RastreadorEntity> {
    const { rows } = await executor.query<RastreadorEntity>(
      `insert into rastreadores (imei, traccar_device_id, modelo, protocolo)
       values ($1, $2, $3, $4) returning *`,
      [data.imei, data.traccarDeviceId ?? null, data.modelo ?? null, data.protocolo ?? null],
    );
    return rows[0];
  }

  async updateStatus(
    id: string,
    status: RastreadorEntity['status'],
    executor: Queryable = this.pool,
  ): Promise<RastreadorEntity | null> {
    const { rows } = await executor.query<RastreadorEntity>(
      `update rastreadores set status = $1, atualizado_em = now() where id = $2 returning *`,
      [status, id],
    );
    return rows[0] ?? null;
  }
}
