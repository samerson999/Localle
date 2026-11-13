import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export interface CurrentPositionRow {
  asset_id: string;
  plate: string | null;
  rotulo: string;
  icone: string | null;
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
  /** Últimos atributos conhecidos do rastreador e mapeamento do modelo: entrada de `lerTelemetria`. */
  ultimos_atributos: Record<string, unknown> | null;
  atributos_vistos_em: Record<string, unknown> | null;
  atributo_tensao: string | null;
  sinal_max: number | null;
  atributo_bloqueio: string | null;
  atributo_odometro: string | null;
}

export interface UsoDiarioRow {
  asset_id: string;
  /** Dia no fuso pedido, `YYYY-MM-DD`. */
  dia: string;
  dist_m: number;
  /** Só os blocos até a hora de `agora` no fuso (comparação justa de hoje, ainda em andamento, com os dias anteriores). */
  dist_ate_agora_m: number;
  minutos_mov: number;
}

export interface EventoRow {
  id: string;
  asset_id: string | null;
  plate: string | null;
  rotulo: string | null;
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
         a.id as asset_id, a.plate, a.rotulo, a.icone,
         v.fix_time,
         st_x(v.geom) as longitude, st_y(v.geom) as latitude,
         v.speed_kmh, v.ignition,
         i.rastreador_id, i.id as instalacao_id, r.imei, r.modelo, i.instalado_em,
         rc.ultimos_atributos, rc.atributos_vistos_em, m.atributo_tensao, m.sinal_max, m.atributo_bloqueio, m.atributo_odometro,
         -- pacote anterior à instalação vigente pertence ao ativo anterior (mesma regra da view)
         case when rc.ultimo_pacote_em >= i.instalado_em then rc.ultimo_pacote_em end as ultimo_pacote_em,
         case when rc.ultima_posicao_valida_em >= i.instalado_em then rc.ultima_posicao_valida_em end
           as ultima_posicao_valida_em
       from assets a
       left join v_localizacao_atual v on v.asset_id = a.id
       left join instalacoes i
         on i.asset_id = a.id and i.client_id = a.client_id and i.papel = 'principal' and i.desinstalado_em is null
       left join rastreadores r on r.id = i.rastreador_id
       left join rastreador_modelos m on m.id = r.modelo_id
       left join rastreador_comunicacao rc on rc.rastreador_id = i.rastreador_id
       where a.client_id = $1 and a.status = 'ativo'
       order by a.rotulo`,
      [clientId],
    );
    return rows;
  }

  /** Eventos do cliente no período, mais recentes primeiro; `assetId` opcional restringe a um ativo. */
  async eventos(clientId: string, from: Date, to: Date, assetId: string | null): Promise<EventoRow[]> {
    const { rows } = await this.pool.query<EventoRow>(
      `select e.id, e.asset_id, a.plate, a.rotulo, e.tipo, e.origem, e.ts,
         st_x(p.geom) as longitude, st_y(p.geom) as latitude, p.speed_kmh, e.attributes
       from eventos e
       left join assets a on a.id = e.asset_id and a.client_id = e.client_id
       -- evento de pacote de status: ts é a hora em que chegou e a posição (repetida) é de antes, em attributes.posicaoEm
       left join posicoes p
         on p.id = e.posicao_id and p.rastreador_id = e.rastreador_id
         and p.fix_time = coalesce((e.attributes->>'posicaoEm')::timestamptz, e.ts)
       where e.client_id = $1 and e.ts between $2 and $3 and ($4::uuid is null or e.asset_id = $4)
       order by e.ts desc
       limit 5000`,
      [clientId, from, to, assetId],
    );
    return rows;
  }

  /**
   * Uso por ativo e por dia (fuso `fuso`), de `dias` dias atrás até `agora`, a partir do agregado `uso_5min`
   * (migrations 1794270000000 e 1794310000000). Distância = trajetória de todos os pontos válidos dentro de cada bloco de
   * 5 min + o trecho entre o fim de um bloco e o início do seguinte — no total, a trajetória ponto a ponto, que na HML
   * (12/11/2026) ficou a 0,1–0,4% do odômetro do aparelho e do totalDistance do Traccar. O trecho que chega no primeiro
   * bloco da janela vem do bloco anterior a ela (busca um dia a mais só para o `lag`). Minutos em movimento = blocos com
   * velocidade > 5 km/h × 5 (resolução de 5 minutos). `client_id` é o primeiro filtro; o agregado vem de `posicoes`, já
   * carimbadas com o cliente na ingestão.
   */
  async usoDiario(clientId: string, agora: Date, dias: number, fuso: string): Promise<UsoDiarioRow[]> {
    const { rows } = await this.pool.query<UsoDiarioRow>(
      `with janela as (
         select (date_trunc('day', $2::timestamptz at time zone $4) - make_interval(days => $3)) at time zone $4 as desde
       ),
       blocos as (
         select u.asset_id, u.bucket, u.vel_max,
           coalesce(u.dist_m, 0) + case when p_ant is not null then st_distance(p_ant::geography, u.p_ini::geography) else 0 end as dist,
           -- bloco começou até a hora de agora (no fuso), em qualquer dia: hoje até agora × os dias anteriores até a mesma hora
           (u.bucket at time zone $4)::time <= ($2::timestamptz at time zone $4)::time as ate_agora
         from (
           select u.*, lag(u.p_fim) over (partition by u.asset_id order by u.bucket) as p_ant
           from uso_5min u, janela j
           where u.client_id = $1 and u.bucket >= j.desde - interval '1 day' and u.bucket <= $2
         ) u, janela j
         where u.bucket >= j.desde
       )
       select asset_id, to_char(bucket at time zone $4, 'YYYY-MM-DD') as dia,
         sum(dist)::float8 as dist_m,
         coalesce(sum(dist) filter (where ate_agora), 0)::float8 as dist_ate_agora_m,
         (count(*) filter (where vel_max > 5) * 5)::int as minutos_mov
       from blocos
       group by asset_id, dia
       order by dia, asset_id`,
      [clientId, agora, dias, fuso],
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
