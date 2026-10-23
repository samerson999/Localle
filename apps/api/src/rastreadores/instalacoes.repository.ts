import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { BaseRepository } from '../db/base.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { InstalacaoEntity } from './instalacao.entity';

/**
 * `instalacoes` tem `client_id` (quem recebeu o rastreador em comodato) — estende `BaseRepository` para
 * herdar o filtro de isolamento em leitura/escrita. A prevenção de vínculo simultâneo inválido é do
 * próprio banco (exclusion constraints da migration), não de lógica de aplicação — ver `telemetria/schema.spec.ts`.
 */
@Injectable()
export class InstalacoesRepository extends BaseRepository<InstalacaoEntity> {
  protected readonly table = 'instalacoes';

  constructor(@Inject(PG_POOL) pool: Pool) {
    super(pool);
  }

  async findAtivaPorRastreador(rastreadorId: string): Promise<InstalacaoEntity | null> {
    const { rows } = await this.pool.query<InstalacaoEntity>(
      `select * from instalacoes where rastreador_id = $1 and desinstalado_em is null limit 1`,
      [rastreadorId],
    );
    return rows[0] ?? null;
  }

  async instalar(
    clientId: string,
    data: {
      rastreadorId: string;
      assetId: string;
      papel?: InstalacaoEntity['papel'];
      instaladoEm: Date;
      tecnico: string;
      kmInicial?: string | null;
      foto?: string | null;
    },
    executor: Queryable = this.pool,
  ): Promise<InstalacaoEntity> {
    const { rows } = await executor.query<InstalacaoEntity>(
      `insert into instalacoes (client_id, rastreador_id, asset_id, papel, instalado_em, tecnico, km_inicial, foto)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [
        clientId,
        data.rastreadorId,
        data.assetId,
        data.papel ?? 'principal',
        data.instaladoEm,
        data.tecnico,
        data.kmInicial ?? null,
        data.foto ?? null,
      ],
    );
    return rows[0];
  }

  async desinstalar(
    id: string,
    desinstaladoEm: Date,
    executor: Queryable = this.pool,
  ): Promise<InstalacaoEntity> {
    const { rows } = await executor.query<InstalacaoEntity>(
      `update instalacoes set desinstalado_em = $1 where id = $2 and desinstalado_em is null returning *`,
      [desinstaladoEm, id],
    );
    return rows[0];
  }
}
