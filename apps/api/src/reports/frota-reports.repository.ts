import { Inject, Injectable } from '@nestjs/common';
import type { Point } from '@localle/shared/points';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export interface AtivoDoRelatorio {
  id: string;
  plate: string;
}

/** Teto de pontos por ativo num relatório (31 dias a 1 posição/30 s ≈ 90 mil): protege a memória da API. */
export const MAX_PONTOS_POR_ATIVO = 120_000;

/**
 * Leitura das posições para os relatórios de frota. `client_id` é sempre o primeiro filtro, e toda
 * consulta em `posicoes` filtra por ativo + intervalo de `fix_time` (docs/ARQUITETURA-BACKEND.md § 2.5),
 * um ativo por vez — nunca a frota inteira de uma vez.
 */
@Injectable()
export class FrotaReportsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Ativos do cliente no escopo pedido (todos, se `ids` for null). Inclui vendidos/baixados de propósito:
   * relatório de período conta o veículo nos períodos em que operou (PRODUCT.md, "Ciclo de vida").
   */
  async ativos(clientId: string, ids: string[] | null): Promise<AtivoDoRelatorio[]> {
    const { rows } = await this.pool.query<AtivoDoRelatorio>(
      `select id, plate from assets where client_id = $1 and ($2::uuid[] is null or id = any($2::uuid[])) order by plate`,
      [clientId, ids],
    );
    return rows;
  }

  /** Posições válidas do ativo no período, em ordem — formato `Point` dos cálculos de packages/shared. */
  async pontos(clientId: string, assetId: string, from: Date, to: Date): Promise<Point[]> {
    const { rows } = await this.pool.query<{ t: string; lat: number; lon: number; v: number; ign: boolean }>(
      `select extract(epoch from fix_time) * 1000 as t, st_y(geom) as lat, st_x(geom) as lon,
         coalesce(speed_kmh, 0)::float8 as v, coalesce(ignition, false) as ign
       from posicoes
       where client_id = $1 and asset_id = $2 and fix_time between $3 and $4 and valid
       order by fix_time
       limit $5`,
      [clientId, assetId, from, to, MAX_PONTOS_POR_ATIVO],
    );
    return rows.map((r) => [Number(r.t), r.lat, r.lon, r.v, r.ign ? 1 : 0]);
  }

  /** "Passou por aqui": só as posições dentro do raio (PostGIS faz o corte, com índice espacial). */
  async pontosNoRaio(
    clientId: string,
    assetId: string,
    from: Date,
    to: Date,
    centro: [number, number],
    raioM: number,
  ): Promise<Point[]> {
    const { rows } = await this.pool.query<{ t: string; lat: number; lon: number; v: number; ign: boolean }>(
      `select extract(epoch from fix_time) * 1000 as t, st_y(geom) as lat, st_x(geom) as lon,
         coalesce(speed_kmh, 0)::float8 as v, coalesce(ignition, false) as ign
       from posicoes
       where client_id = $1 and asset_id = $2 and fix_time between $3 and $4 and valid
         and st_dwithin(geom::geography, st_setsrid(st_makepoint($6, $5), 4326)::geography, $7)
       order by fix_time
       limit $8`,
      [clientId, assetId, from, to, centro[0], centro[1], raioM, MAX_PONTOS_POR_ATIVO],
    );
    return rows.map((r) => [Number(r.t), r.lat, r.lon, r.v, r.ign ? 1 : 0]);
  }

  /** Cercas do cliente no formato que `inFence` (packages/shared/src/utils.ts) entende. */
  async cercas(clientId: string, id: string | null) {
    const { rows } = await this.pool.query<{ id: string; nome: string; tipo: string; forma: string; centro: string | null; raio_m: string | null; poligono: string | null }>(
      `select id, nome, tipo, forma, st_asgeojson(centro) as centro, raio_m, st_asgeojson(poligono) as poligono
       from cercas where client_id = $1 and removida_em is null and ($2::uuid is null or id = $2) order by nome`,
      [clientId, id],
    );
    return rows.map((r) => {
      const c = r.centro ? (JSON.parse(r.centro).coordinates as [number, number]) : null;
      const anel = r.poligono ? (JSON.parse(r.poligono).coordinates[0] as [number, number][]) : null;
      return {
        id: r.id,
        name: r.nome,
        type: r.tipo,
        shape: r.forma === 'circulo' ? 'circle' : 'polygon',
        center: c ? [c[1], c[0]] : undefined,
        radius: r.raio_m === null ? undefined : Number(r.raio_m),
        points: anel ? anel.slice(0, -1).map(([lon, lat]) => [lat, lon]) : undefined,
      };
    });
  }
}
