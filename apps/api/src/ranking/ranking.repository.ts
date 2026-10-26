import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export const ORIGENS_EVENTO = ['rastreador', 'can', 'manual', 'regra'] as const;
export type OrigemEvento = (typeof ORIGENS_EVENTO)[number];

export interface MatrizRow {
  client_id: string;
  codigo: string;
  label: string | null;
  categoria: string | null;
  peso: string | null;
  faixas: { min: number; weight: number }[] | null;
  ativo: boolean;
  custom: boolean;
}

export interface MatrizInput {
  codigo: string;
  label: string | null;
  categoria: string | null;
  peso: number | null;
  faixas: { min: number; weight: number }[] | null;
  ativo: boolean;
  custom: boolean;
}

export interface EventoRow {
  id: string;
  client_id: string;
  motorista_id: string;
  asset_id: string | null;
  ts: Date;
  tipo: string;
  valor: string | null;
  origem: OrigemEvento;
  evento_id: string | null;
}

export interface EventoInput {
  motoristaId: string;
  assetId: string | null;
  ts: Date;
  tipo: string;
  valor: number | null;
  origem: OrigemEvento;
}

@Injectable()
export class RankingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async matriz(clientId: string): Promise<MatrizRow[]> {
    const { rows } = await this.pool.query<MatrizRow>('select * from ranking_matriz where client_id = $1 order by codigo', [clientId]);
    return rows;
  }

  async salvarMatriz(clientId: string, m: MatrizInput): Promise<MatrizRow> {
    const { rows } = await this.pool.query<MatrizRow>(
      `insert into ranking_matriz (client_id, codigo, label, categoria, peso, faixas, ativo, custom)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       on conflict (client_id, codigo) do update set label = excluded.label, categoria = excluded.categoria, peso = excluded.peso,
         faixas = excluded.faixas, ativo = excluded.ativo, custom = excluded.custom, updated_at = now()
       returning *`,
      [clientId, m.codigo, m.label, m.categoria, m.peso, m.faixas === null ? null : JSON.stringify(m.faixas), m.ativo, m.custom],
    );
    return rows[0];
  }

  /** "Restaurar padrão" de um código do catálogo (ou apagar um tipo próprio). */
  async removerMatriz(clientId: string, codigo: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from ranking_matriz where client_id = $1 and codigo = $2', [clientId, codigo]);
    return (rowCount ?? 0) > 0;
  }

  async eventos(clientId: string, de: Date, ate: Date): Promise<EventoRow[]> {
    const { rows } = await this.pool.query<EventoRow>('select * from ranking_eventos where client_id = $1 and ts >= $2 and ts <= $3 order by ts', [clientId, de, ate]);
    return rows;
  }

  /** Motorista (e ativo, se houver) precisam ser do cliente. */
  async criarEvento(clientId: string, e: EventoInput): Promise<EventoRow | null> {
    const { rows } = await this.pool.query<EventoRow>(
      `insert into ranking_eventos (client_id, motorista_id, asset_id, ts, tipo, valor, origem)
       select $1, m.id, (select a.id from assets a where a.client_id = $1 and a.id = $3), $4, $5, $6, $7
       from motoristas m where m.client_id = $1 and m.id = $2 returning *`,
      [clientId, e.motoristaId, e.assetId, e.ts, e.tipo, e.valor, e.origem],
    );
    return rows[0] ?? null;
  }

  async removerEvento(clientId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from ranking_eventos where client_id = $1 and id = $2', [clientId, id]);
    return (rowCount ?? 0) > 0;
  }

  async motoristas(clientId: string): Promise<{ id: string; nome: string; regime: 'cargas' | 'passageiros' }[]> {
    const { rows } = await this.pool.query<{ id: string; nome: string; regime: 'cargas' | 'passageiros' }>(
      'select id, nome, regime from motoristas where client_id = $1 and desativado_em is null order by nome',
      [clientId],
    );
    return rows;
  }

  /** Km por motorista no período: amplitude do odômetro dos abastecimentos dos ativos cujo motorista do cadastro é ele. */
  async kmPorMotorista(clientId: string, de: Date, ate: Date): Promise<Map<string, number>> {
    const { rows } = await this.pool.query<{ motorista_id: string; km: string }>(
      `select a.motorista_id, sum(x.km) as km from (
         select asset_id, max(odometro) - min(odometro) as km from abastecimentos
         where client_id = $1 and ts >= $2 and ts <= $3 group by asset_id having count(*) > 1
       ) x join assets a on a.id = x.asset_id and a.client_id = $1 and a.motorista_id is not null
       group by a.motorista_id`,
      [clientId, de, ate],
    );
    return new Map(rows.map((r) => [r.motorista_id, Number(r.km)]));
  }
}
