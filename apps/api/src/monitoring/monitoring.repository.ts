import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export interface CurrentPositionRow {
  asset_id: string;
  plate: string;
  fix_time: Date | null;
  longitude: number | null;
  latitude: number | null;
  speed_kmh: number | null;
  ignition: boolean | null;
}

export interface HistoryPositionRow {
  fix_time: Date;
  longitude: number;
  latitude: number;
  speed_kmh: number | null;
  course: number | null;
  valid: boolean;
}

/**
 * Agregação sobre `assets`/`v_localizacao_atual`/`posicoes` — não é CRUD de uma linha, não estende
 * `BaseRepository`, mas segue a mesma regra: `client_id` é sempre o primeiro filtro do `where`
 * (docs/ARQUITETURA-BACKEND.md § 2.1, mesma convenção de `ReportsRepository`).
 */
@Injectable()
export class MonitoringRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Um ativo sem posição qualificada em `v_localizacao_atual` aparece com campos de posição `null` —
   * é o estado "aguardando primeira posição" (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.4), não um erro.
   */
  async frotaAtual(clientId: string): Promise<CurrentPositionRow[]> {
    const { rows } = await this.pool.query<CurrentPositionRow>(
      `select
         a.id as asset_id, a.plate,
         v.fix_time,
         st_x(v.geom) as longitude, st_y(v.geom) as latitude,
         v.speed_kmh, v.ignition
       from assets a
       left join v_localizacao_atual v on v.asset_id = a.id
       where a.client_id = $1
       order by a.plate`,
      [clientId],
    );
    return rows;
  }

  async historicoDoAtivo(clientId: string, assetId: string, from: Date, to: Date): Promise<HistoryPositionRow[]> {
    const { rows } = await this.pool.query<HistoryPositionRow>(
      `select fix_time, st_x(geom) as longitude, st_y(geom) as latitude, speed_kmh, course, valid
       from posicoes
       where client_id = $1 and asset_id = $2 and fix_time between $3 and $4
       order by fix_time asc
       limit 10000`,
      [clientId, assetId, from, to],
    );
    return rows;
  }
}
