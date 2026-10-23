import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export interface KmReportRow {
  asset_id: string;
  desde: Date | null;
  ate: Date | null;
  distancia_m: number | null;
  amostras: number;
}

export interface EpisodioRow {
  inicio: Date;
  fim: Date;
  amostras: number;
  velocidade_max?: number;
}

/**
 * Abaixo desta velocidade a posição conta como "parado" para o relatório de paradas. É calibração
 * técnica (ruído de GPS parado), não parâmetro de produto do Setup (docs/PLANO-SETUP-ADMIN.md não lista
 * nada equivalente fora da camada "modelo de rastreador", que é sobre CAN, não GPS) — por isso fica
 * fixo no código, não em `client_settings`.
 */
const VELOCIDADE_PARADO_KMH = 2;

/**
 * Não estende `BaseRepository` (não é CRUD de uma linha por id) — é agregação sobre `posicoes`
 * (docs/ARQUITETURA-BACKEND.md § 2.5: sempre filtrar por asset/cliente e intervalo de `ts`/`fix_time`,
 * nunca varrer a frota toda). `client_id` é sempre o primeiro filtro do `where`, igual à regra do
 * `BaseRepository` — só não há método genérico que sirva para agregação.
 */
@Injectable()
export class ReportsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async kmPorAtivo(clientId: string, assetId: string, from: Date, to: Date): Promise<KmReportRow | null> {
    const { rows } = await this.pool.query<KmReportRow>(
      `select
         asset_id,
         min(fix_time) as desde,
         max(fix_time) as ate,
         (max(odometer_m) - min(odometer_m))::float8 as distancia_m,
         count(*)::int as amostras
       from posicoes
       where client_id = $1 and asset_id = $2 and valid = true and fix_time between $3 and $4
       group by asset_id`,
      [clientId, assetId, from, to],
    );
    return rows[0] ?? null;
  }

  /**
   * Episódios de excesso de velocidade: agrupa posições consecutivas acima do limite (técnica
   * "gaps-and-islands" — `row_number() over (order by fix_time) - row_number() over (partition by acima
   * order by fix_time)` fica constante dentro de cada sequência contínua do mesmo valor de `acima`), e
   * filtra pelos que duram pelo menos `duracaoMinSegundos`. Aproximação pela amostragem discreta de
   * posições: a duração real entre dois pontos não é interpolada, só o intervalo entre a primeira e a
   * última amostra acima do limite — correto por falta, nunca por excesso (um episódio real mais curto
   * que o intervalo de amostragem nunca aparece).
   */
  async excessosPorAtivo(
    clientId: string,
    assetId: string,
    from: Date,
    to: Date,
    limiteKmh: number,
    duracaoMinSegundos: number,
  ): Promise<EpisodioRow[]> {
    const { rows } = await this.pool.query<EpisodioRow>(
      `with pontos as (
         select fix_time, speed_kmh, (speed_kmh > $5) as acima
         from posicoes
         where client_id = $1 and asset_id = $2 and valid = true and fix_time between $3 and $4
       ),
       marcado as (
         select *,
           row_number() over (order by fix_time) - row_number() over (partition by acima order by fix_time) as grupo
         from pontos
       )
       select min(fix_time) as inicio, max(fix_time) as fim, count(*)::int as amostras,
              max(speed_kmh)::float8 as velocidade_max
       from marcado
       where acima
       group by grupo
       having extract(epoch from (max(fix_time) - min(fix_time))) >= $6
       order by min(fix_time)`,
      [clientId, assetId, from, to, limiteKmh, duracaoMinSegundos],
    );
    return rows;
  }

  /** Mesma técnica de `excessosPorAtivo`, agrupando posições com velocidade abaixo do ruído de GPS parado. */
  async paradasPorAtivo(
    clientId: string,
    assetId: string,
    from: Date,
    to: Date,
    duracaoMinMinutos: number,
  ): Promise<EpisodioRow[]> {
    const { rows } = await this.pool.query<EpisodioRow>(
      `with pontos as (
         select fix_time, (coalesce(speed_kmh, 999) <= $5) as parado
         from posicoes
         where client_id = $1 and asset_id = $2 and valid = true and fix_time between $3 and $4
       ),
       marcado as (
         select *,
           row_number() over (order by fix_time) - row_number() over (partition by parado order by fix_time) as grupo
         from pontos
       )
       select min(fix_time) as inicio, max(fix_time) as fim, count(*)::int as amostras
       from marcado
       where parado
       group by grupo
       having extract(epoch from (max(fix_time) - min(fix_time))) / 60.0 >= $6
       order by min(fix_time)`,
      [clientId, assetId, from, to, VELOCIDADE_PARADO_KMH, duracaoMinMinutos],
    );
    return rows;
  }
}
