import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export const STATUS_PNEU = ['estoque', 'montado', 'recapagem', 'descartado'] as const;
export type StatusPneu = (typeof STATUS_PNEU)[number];
export const TIPOS_MOVIMENTO = ['compra', 'montagem', 'rodizio', 'retirada', 'envio_recapagem', 'recapagem', 'descarte', 'medicao'] as const;
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number];

export interface PneuRow {
  id: string;
  client_id: string;
  numero_fogo: string;
  marca: string | null;
  modelo: string | null;
  medida: string | null;
  vidas_max: number;
  vida_atual: number;
  sulco_inicial_mm: string;
  sulco_atual_mm: string;
  status: StatusPneu;
  asset_id: string | null;
  posicao: string | null;
  km_montagem: string | null;
  km_acumulado: string;
  custo_total: string;
  dados: Record<string, string | number>;
  created_at: Date;
  updated_at: Date;
}

export interface PneuInput {
  numeroFogo: string;
  marca: string | null;
  modelo: string | null;
  medida: string | null;
  vidasMax: number;
  sulcoInicialMm: number;
  custo: number;
  dados: Record<string, string | number>;
}

export interface MovimentoRow {
  id: string;
  client_id: string;
  pneu_id: string;
  tipo: TipoMovimento;
  ts: Date;
  asset_id: string | null;
  posicao: string | null;
  km_veiculo: string | null;
  sulco_mm: string | null;
  custo: string | null;
  obs: string | null;
}

export interface MovimentoInput {
  tipo: TipoMovimento;
  ts: Date;
  assetId: string | null;
  posicao: string | null;
  kmVeiculo: number | null;
  sulcoMm: number | null;
  custo: number | null;
  obs: string | null;
}

@Injectable()
export class PneusRepository {
  constructor(@Inject(PG_POOL) readonly pool: Pool) {}

  async listar(clientId: string, status: StatusPneu | null, assetId: string | null): Promise<PneuRow[]> {
    const { rows } = await this.pool.query<PneuRow>(
      `select * from pneus where client_id = $1 and ($2::text is null or status = $2) and ($3::uuid is null or asset_id = $3) order by numero_fogo`,
      [clientId, status, assetId],
    );
    return rows;
  }

  async buscar(clientId: string, id: string, executor: Pool | PoolClient = this.pool, lock = false): Promise<PneuRow | null> {
    const { rows } = await executor.query<PneuRow>(`select * from pneus where client_id = $1 and id = $2 ${lock ? 'for update' : ''}`, [clientId, id]);
    return rows[0] ?? null;
  }

  /** Cadastro = compra: nasce em estoque na vida 1 com o custo de compra, e a movimentação `compra` registrada. */
  async criar(clientId: string, p: PneuInput, ts: Date, userId: string | null): Promise<PneuRow> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<PneuRow>(
        `insert into pneus (client_id, numero_fogo, marca, modelo, medida, vidas_max, sulco_inicial_mm, sulco_atual_mm, custo_total, dados)
         values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9::jsonb) returning *`,
        [clientId, p.numeroFogo, p.marca, p.modelo, p.medida, p.vidasMax, p.sulcoInicialMm, p.custo, JSON.stringify(p.dados)],
      );
      await this.registrarMovimento(client, clientId, rows[0].id, { tipo: 'compra', ts, assetId: null, posicao: null, kmVeiculo: null, sulcoMm: p.sulcoInicialMm, custo: p.custo, obs: null }, userId);
      await client.query('commit');
      return rows[0];
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  async atualizarEstado(client: PoolClient, clientId: string, id: string, data: Partial<Record<keyof PneuRow, unknown>>): Promise<PneuRow> {
    const colunas = Object.keys(data);
    const valores = Object.values(data);
    const sets = colunas.map((c, i) => `${c} = $${i + 3}`);
    const { rows } = await client.query<PneuRow>(`update pneus set ${sets.join(', ')}, updated_at = now() where client_id = $1 and id = $2 returning *`, [clientId, id, ...valores]);
    return rows[0];
  }

  async registrarMovimento(client: PoolClient, clientId: string, pneuId: string, m: MovimentoInput, userId: string | null): Promise<MovimentoRow> {
    const { rows } = await client.query<MovimentoRow>(
      `insert into pneu_movimentos (client_id, pneu_id, tipo, ts, asset_id, posicao, km_veiculo, sulco_mm, custo, obs, criado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
      [clientId, pneuId, m.tipo, m.ts, m.assetId, m.posicao, m.kmVeiculo, m.sulcoMm, m.custo, m.obs, userId],
    );
    return rows[0];
  }

  async movimentos(clientId: string, pneuId: string): Promise<MovimentoRow[]> {
    const { rows } = await this.pool.query<MovimentoRow>('select * from pneu_movimentos where client_id = $1 and pneu_id = $2 order by ts desc', [clientId, pneuId]);
    return rows;
  }

  async ativoDoCliente(client: PoolClient, clientId: string, assetId: string): Promise<boolean> {
    const { rowCount } = await client.query('select 1 from assets where client_id = $1 and id = $2', [clientId, assetId]);
    return (rowCount ?? 0) > 0;
  }

  async posicaoOcupada(client: PoolClient, clientId: string, assetId: string, posicao: string, exceto: string): Promise<boolean> {
    const { rowCount } = await client.query(`select 1 from pneus where client_id = $1 and asset_id = $2 and posicao = $3 and status = 'montado' and id <> $4`, [clientId, assetId, posicao, exceto]);
    return (rowCount ?? 0) > 0;
  }
}
