import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';

export const GATILHOS = ['km', 'tempo', 'ambos'] as const;
export type Gatilho = (typeof GATILHOS)[number];
export const STATUS_OS = ['aberta', 'orcamento', 'aprovada', 'em_execucao', 'concluida', 'cancelada'] as const;
export type StatusOs = (typeof STATUS_OS)[number];
export const TIPOS_OS = ['preventiva', 'corretiva'] as const;
export type TipoOs = (typeof TIPOS_OS)[number];

export interface PlanoRow {
  id: string;
  client_id: string;
  nome: string;
  servico: string;
  itens: string;
  gatilho: Gatilho;
  km_intervalo: number;
  dias_intervalo: number;
  antecedencia_km: number;
  antecedencia_dias: number;
  critico_dias: number | null;
  critico_km: number | null;
  ativo: boolean;
  asset_ids: string[];
}

export interface PlanoInput {
  nome: string;
  servico: string;
  itens: string;
  gatilho: Gatilho;
  kmIntervalo: number;
  diasIntervalo: number;
  antecedenciaKm: number;
  antecedenciaDias: number;
  criticoDias: number | null;
  criticoKm: number | null;
  ativo: boolean;
  assetIds: string[];
}

export interface OsRow {
  id: string;
  client_id: string;
  numero: string;
  asset_id: string;
  plano_id: string | null;
  tipo: TipoOs;
  titulo: string;
  descricao: string | null;
  servicos: string[];
  status: StatusOs;
  nao_planejada: boolean;
  aberta_em: Date;
  entrada_oficina_em: Date | null;
  liberada_em: Date | null;
  odometro: string | null;
  custo: string;
  fornecedor: string | null;
  dados: Record<string, unknown>;
}

export interface OsInput {
  assetId: string;
  planoId: string | null;
  tipo: TipoOs;
  titulo: string;
  descricao: string | null;
  servicos: string[];
  status: StatusOs;
  naoPlanejada: boolean;
  abertaEm: Date;
  entradaOficinaEm: Date | null;
  liberadaEm: Date | null;
  odometro: number | null;
  custo: number;
  fornecedor: string | null;
  dados: Record<string, unknown>;
}

const SELECT_PLANO = `
  select p.*, coalesce((select array_agg(a.asset_id order by a.asset_id) from manutencao_plano_ativos a where a.plano_id = p.id), '{}') as asset_ids
  from manutencao_planos p`;

/**
 * Duas tabelas de domínio no mesmo repository (plano + OS andam juntos). Não estende `BaseRepository`
 * por isso; todo método recebe `clientId` e o aplica no `where`, mesma regra.
 */
@Injectable()
export class ManutencaoRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listarPlanos(clientId: string): Promise<PlanoRow[]> {
    const { rows } = await this.pool.query<PlanoRow>(`${SELECT_PLANO} where p.client_id = $1 order by p.nome`, [clientId]);
    return rows;
  }

  async buscarPlano(clientId: string, id: string): Promise<PlanoRow | null> {
    const { rows } = await this.pool.query<PlanoRow>(`${SELECT_PLANO} where p.client_id = $1 and p.id = $2`, [clientId, id]);
    return rows[0] ?? null;
  }

  /** Ativos de outro cliente simplesmente não entram no vínculo (`insert ... select` filtrado). */
  async salvarPlano(clientId: string, p: PlanoInput, id: string | null): Promise<PlanoRow | null> {
    return withTransaction(this.pool, async (tx) => {
      const valores = [clientId, p.nome, p.servico, p.itens, p.gatilho, p.kmIntervalo, p.diasIntervalo, p.antecedenciaKm, p.antecedenciaDias, p.criticoDias, p.criticoKm, p.ativo];
      let planoId = id;
      if (id) {
        const r = await tx.query<{ id: string }>(
          `update manutencao_planos set nome = $2, servico = $3, itens = $4, gatilho = $5, km_intervalo = $6, dias_intervalo = $7,
             antecedencia_km = $8, antecedencia_dias = $9, critico_dias = $10, critico_km = $11, ativo = $12, updated_at = now()
           where client_id = $1 and id = $13 returning id`,
          [...valores, id],
        );
        if (r.rowCount === 0) return null;
      } else {
        const r = await tx.query<{ id: string }>(
          `insert into manutencao_planos (client_id, nome, servico, itens, gatilho, km_intervalo, dias_intervalo, antecedencia_km, antecedencia_dias, critico_dias, critico_km, ativo)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
          valores,
        );
        planoId = r.rows[0].id;
      }
      await tx.query('delete from manutencao_plano_ativos where client_id = $1 and plano_id = $2', [clientId, planoId]);
      if (p.assetIds.length > 0) {
        await tx.query(
          `insert into manutencao_plano_ativos (client_id, plano_id, asset_id)
           select $1, $2, a.id from assets a where a.client_id = $1 and a.id = any($3::uuid[])`,
          [clientId, planoId, p.assetIds],
        );
      }
      const { rows } = await tx.query<PlanoRow>(`${SELECT_PLANO} where p.client_id = $1 and p.id = $2`, [clientId, planoId]);
      return rows[0];
    });
  }

  async removerPlano(clientId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from manutencao_planos where client_id = $1 and id = $2', [clientId, id]);
    return (rowCount ?? 0) > 0;
  }

  async listarOs(clientId: string, assetId: string | null, abertas: boolean): Promise<OsRow[]> {
    const { rows } = await this.pool.query<OsRow>(
      `select * from ordens_servico where client_id = $1 and ($2::uuid is null or asset_id = $2)
         and (not $3 or status not in ('concluida', 'cancelada'))
       order by aberta_em desc limit 500`,
      [clientId, assetId, abertas],
    );
    return rows;
  }

  async buscarOs(clientId: string, id: string): Promise<OsRow | null> {
    const { rows } = await this.pool.query<OsRow>('select * from ordens_servico where client_id = $1 and id = $2', [clientId, id]);
    return rows[0] ?? null;
  }

  async salvarOs(clientId: string, o: OsInput, id: string | null): Promise<OsRow | null | 'ativo_invalido' | 'plano_invalido'> {
    const ativo = await this.pool.query('select 1 from assets where client_id = $1 and id = $2', [clientId, o.assetId]);
    if (ativo.rowCount === 0) return 'ativo_invalido';
    if (o.planoId) {
      const plano = await this.pool.query('select 1 from manutencao_planos where client_id = $1 and id = $2', [clientId, o.planoId]);
      if (plano.rowCount === 0) return 'plano_invalido';
    }
    const valores = [clientId, o.assetId, o.planoId, o.tipo, o.titulo, o.descricao, o.servicos, o.status, o.naoPlanejada, o.abertaEm, o.entradaOficinaEm, o.liberadaEm, o.odometro, o.custo, o.fornecedor, JSON.stringify(o.dados)];
    if (id) {
      const { rows } = await this.pool.query<OsRow>(
        `update ordens_servico set asset_id = $2, plano_id = $3, tipo = $4, titulo = $5, descricao = $6, servicos = $7, status = $8, nao_planejada = $9,
           aberta_em = $10, entrada_oficina_em = $11, liberada_em = $12, odometro = $13, custo = $14, fornecedor = $15, dados = $16::jsonb, updated_at = now()
         where client_id = $1 and id = $17 returning *`,
        [...valores, id],
      );
      return rows[0] ?? null;
    }
    const { rows } = await this.pool.query<OsRow>(
      `insert into ordens_servico (client_id, asset_id, plano_id, tipo, titulo, descricao, servicos, status, nao_planejada, aberta_em, entrada_oficina_em, liberada_em, odometro, custo, fornecedor, dados)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb) returning *`,
      valores,
    );
    return rows[0];
  }

  /** Última OS concluída do serviço no ativo (base do próximo vencimento) e OS aberta do plano. */
  async ultimaConcluida(clientId: string, assetId: string, servico: string): Promise<OsRow | null> {
    const { rows } = await this.pool.query<OsRow>(
      `select * from ordens_servico where client_id = $1 and asset_id = $2 and status = 'concluida' and $3 = any(servicos)
       order by liberada_em desc limit 1`,
      [clientId, assetId, servico],
    );
    return rows[0] ?? null;
  }

  async osAbertaDoPlano(clientId: string, assetId: string, planoId: string): Promise<OsRow | null> {
    const { rows } = await this.pool.query<OsRow>(
      `select * from ordens_servico where client_id = $1 and asset_id = $2 and plano_id = $3 and status not in ('concluida', 'cancelada') order by aberta_em desc limit 1`,
      [clientId, assetId, planoId],
    );
    return rows[0] ?? null;
  }

  /** Km atual do ativo: o maior odômetro conhecido (último abastecimento ou última OS). */
  async kmAtual(clientId: string, assetId: string): Promise<number> {
    const { rows } = await this.pool.query<{ km: string | null }>(
      `select greatest(
         (select max(odometro) from abastecimentos where client_id = $1 and asset_id = $2),
         (select max(odometro) from ordens_servico where client_id = $1 and asset_id = $2)
       ) as km`,
      [clientId, assetId],
    );
    return rows[0]?.km ? Number(rows[0].km) : 0;
  }
}
