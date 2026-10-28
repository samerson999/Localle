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
  rastreador_id: string | null;
  instalacao_id: string | null;
  imei: string | null;
  modelo: string | null;
  instalado_em: Date | null;
  ultimo_pacote_em: Date | null;
  ultima_posicao_valida_em: Date | null;
}

export interface EventoRow {
  id: string;
  asset_id: string | null;
  plate: string | null;
  tipo: string;
  origem: string;
  ts: Date;
  longitude: number | null;
  latitude: number | null;
  speed_kmh: number | null;
  attributes: Record<string, unknown>;
}

export interface HistoryPositionRow {
  fix_time: Date;
  longitude: number;
  latitude: number;
  speed_kmh: number | null;
  course: number | null;
  ignition: boolean | null;
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
         v.speed_kmh, v.ignition,
         i.rastreador_id, i.id as instalacao_id, r.imei, r.modelo, i.instalado_em,
         -- pacote anterior à instalação vigente pertence ao ativo anterior (mesma regra da view)
         case when rc.ultimo_pacote_em >= i.instalado_em then rc.ultimo_pacote_em end as ultimo_pacote_em,
         case when rc.ultima_posicao_valida_em >= i.instalado_em then rc.ultima_posicao_valida_em end
           as ultima_posicao_valida_em
       from assets a
       left join v_localizacao_atual v on v.asset_id = a.id
       left join instalacoes i
         on i.asset_id = a.id and i.client_id = a.client_id and i.papel = 'principal' and i.desinstalado_em is null
       left join rastreadores r on r.id = i.rastreador_id
       left join rastreador_comunicacao rc on rc.rastreador_id = i.rastreador_id
       where a.client_id = $1 and a.status = 'ativo'
       order by a.plate`,
      [clientId],
    );
    return rows;
  }

  /** Eventos do cliente no período, mais recentes primeiro; `assetId` opcional restringe a um ativo. */
  async eventos(clientId: string, from: Date, to: Date, assetId: string | null): Promise<EventoRow[]> {
    const { rows } = await this.pool.query<EventoRow>(
      `select e.id, e.asset_id, a.plate, e.tipo, e.origem, e.ts,
         st_x(p.geom) as longitude, st_y(p.geom) as latitude, p.speed_kmh, e.attributes
       from eventos e
       left join assets a on a.id = e.asset_id and a.client_id = e.client_id
       left join posicoes p
         on p.id = e.posicao_id and p.rastreador_id = e.rastreador_id and p.fix_time = e.ts
       where e.client_id = $1 and e.ts between $2 and $3 and ($4::uuid is null or e.asset_id = $4)
       order by e.ts desc
       limit 5000`,
      [clientId, from, to, assetId],
    );
    return rows;
  }

  async historicoDoAtivo(clientId: string, assetId: string, from: Date, to: Date): Promise<HistoryPositionRow[]> {
    const { rows } = await this.pool.query<HistoryPositionRow>(
      `select fix_time, st_x(geom) as longitude, st_y(geom) as latitude, speed_kmh, course, ignition, valid
       from posicoes
       where client_id = $1 and asset_id = $2 and fix_time between $3 and $4
       order by fix_time asc
       limit 10000`,
      [clientId, assetId, from, to],
    );
    return rows;
  }
}
