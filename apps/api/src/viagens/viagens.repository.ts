import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export const STATUS_VIAGEM = ['aguardando', 'em_andamento', 'concluida', 'cancelada'] as const;
export type StatusViagem = (typeof STATUS_VIAGEM)[number];
export const TIPOS_VIAGEM = ['externo', 'patio'] as const;
export const ETAPAS = ['iniciada', 'carregada', 'descarregada', 'encerrada'] as const;
export type Etapa = (typeof ETAPAS)[number];

export interface Parada {
  fenceId: string;
  time: string;
}

export interface MatrizRow {
  id: string;
  client_id: string;
  nome: string;
  asset_id: string | null;
  motorista_id: string | null;
  dias: number[];
  paradas: Parada[];
  dorme: Record<string, string>;
  ativa: boolean;
}

export interface MatrizInput {
  nome: string;
  assetId: string | null;
  motoristaId: string | null;
  dias: number[];
  paradas: Parada[];
  dorme: Record<string, string>;
  ativa: boolean;
}

export interface ViagemRow {
  id: string;
  client_id: string;
  tipo: (typeof TIPOS_VIAGEM)[number];
  nome: string | null;
  asset_id: string;
  motorista_id: string | null;
  matriz_id: string | null;
  origem_cerca_id: string | null;
  carga_cerca_id: string | null;
  descarga_cerca_id: string | null;
  destino_cerca_id: string | null;
  carga: string | null;
  status: StatusViagem;
  iniciada_em: Date | null;
  carregada_em: Date | null;
  descarregada_em: Date | null;
  encerrada_em: Date | null;
  origem_inicio: string | null;
  dados: Record<string, unknown>;
}

export interface ViagemInput {
  tipo: (typeof TIPOS_VIAGEM)[number];
  nome: string | null;
  assetId: string;
  motoristaId: string | null;
  matrizId: string | null;
  origemCercaId: string | null;
  cargaCercaId: string | null;
  descargaCercaId: string | null;
  destinoCercaId: string | null;
  carga: string | null;
}

export type ErroVinculo = 'ativo_invalido' | 'motorista_invalido' | 'cerca_invalida' | 'matriz_invalida';

@Injectable()
export class ViagensRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listarMatrizes(clientId: string): Promise<MatrizRow[]> {
    const { rows } = await this.pool.query<MatrizRow>('select * from viagem_matrizes where client_id = $1 order by nome', [clientId]);
    return rows;
  }

  async salvarMatriz(clientId: string, m: MatrizInput, id: string | null): Promise<MatrizRow | null | ErroVinculo> {
    const erro = await this.validar(clientId, { assetId: m.assetId, motoristaId: m.motoristaId, cercas: [...m.paradas.map((p) => p.fenceId), ...Object.values(m.dorme)] });
    if (erro) return erro;
    const valores = [clientId, m.nome, m.assetId, m.motoristaId, m.dias, JSON.stringify(m.paradas), JSON.stringify(m.dorme), m.ativa];
    if (id) {
      const { rows } = await this.pool.query<MatrizRow>(
        `update viagem_matrizes set nome = $2, asset_id = $3, motorista_id = $4, dias = $5, paradas = $6::jsonb, dorme = $7::jsonb, ativa = $8, updated_at = now()
         where client_id = $1 and id = $9 returning *`,
        [...valores, id],
      );
      return rows[0] ?? null;
    }
    const { rows } = await this.pool.query<MatrizRow>(
      `insert into viagem_matrizes (client_id, nome, asset_id, motorista_id, dias, paradas, dorme, ativa) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8) returning *`,
      valores,
    );
    return rows[0];
  }

  async removerMatriz(clientId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from viagem_matrizes where client_id = $1 and id = $2', [clientId, id]);
    return (rowCount ?? 0) > 0;
  }

  async listarViagens(clientId: string, assetId: string | null, abertas: boolean): Promise<ViagemRow[]> {
    const { rows } = await this.pool.query<ViagemRow>(
      `select * from viagens where client_id = $1 and ($2::uuid is null or asset_id = $2) and (not $3 or status in ('aguardando', 'em_andamento'))
       order by coalesce(iniciada_em, created_at) desc limit 500`,
      [clientId, assetId, abertas],
    );
    return rows;
  }

  async buscarViagem(clientId: string, id: string): Promise<ViagemRow | null> {
    const { rows } = await this.pool.query<ViagemRow>('select * from viagens where client_id = $1 and id = $2', [clientId, id]);
    return rows[0] ?? null;
  }

  async criarViagem(clientId: string, v: ViagemInput): Promise<ViagemRow | ErroVinculo> {
    const erro = await this.validar(clientId, {
      assetId: v.assetId,
      motoristaId: v.motoristaId,
      matrizId: v.matrizId,
      cercas: [v.origemCercaId, v.cargaCercaId, v.descargaCercaId, v.destinoCercaId].filter((x): x is string => !!x),
    });
    if (erro) return erro;
    const { rows } = await this.pool.query<ViagemRow>(
      `insert into viagens (client_id, tipo, nome, asset_id, motorista_id, matriz_id, origem_cerca_id, carga_cerca_id, descarga_cerca_id, destino_cerca_id, carga)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
      [clientId, v.tipo, v.nome, v.assetId, v.motoristaId, v.matrizId, v.origemCercaId, v.cargaCercaId, v.descargaCercaId, v.destinoCercaId, v.carga],
    );
    return rows[0];
  }

  /**
   * Avança uma etapa com o carimbo informado. Ordem obrigatória (iniciada → carregada → descarregada →
   * encerrada; viagem de pátio ou sem carga planejada vai de iniciada a encerrada), nunca retrocede, e a viagem só é
   * `concluida` ao encerrar. Devolve `null` se não é do cliente, `'ordem'` se a etapa não é a próxima.
   */
  async avancarEtapa(clientId: string, id: string, etapa: Etapa, em: Date, origem: string | null): Promise<ViagemRow | null | 'ordem'> {
    const v = await this.buscarViagem(clientId, id);
    if (!v) return null;
    if (v.status === 'concluida' || v.status === 'cancelada') return 'ordem';
    const ok =
      (etapa === 'iniciada' && !v.iniciada_em) ||
      (etapa === 'carregada' && v.iniciada_em && !v.carregada_em && v.tipo === 'externo') ||
      (etapa === 'descarregada' && v.carregada_em && !v.descarregada_em) ||
      (etapa === 'encerrada' && v.iniciada_em && !v.encerrada_em && (v.tipo === 'patio' || !v.carga_cerca_id || v.descarregada_em));
    if (!ok) return 'ordem';
    const coluna = `${etapa}_em`;
    const { rows } = await this.pool.query<ViagemRow>(
      `update viagens set ${coluna} = $3,
         status = case when $4 = 'encerrada' then 'concluida' else 'em_andamento' end,
         origem_inicio = case when $4 = 'iniciada' then $5 else origem_inicio end, updated_at = now()
       where client_id = $1 and id = $2 returning *`,
      [clientId, id, em, etapa, origem],
    );
    return rows[0];
  }

  async cancelarViagem(clientId: string, id: string): Promise<ViagemRow | null> {
    const { rows } = await this.pool.query<ViagemRow>(
      `update viagens set status = 'cancelada', updated_at = now() where client_id = $1 and id = $2 and status <> 'concluida' returning *`,
      [clientId, id],
    );
    return rows[0] ?? null;
  }

  private async validar(clientId: string, v: { assetId: string | null; motoristaId: string | null; matrizId?: string | null; cercas: string[] }): Promise<ErroVinculo | null> {
    const existe = async (tabela: string, id: string) => ((await this.pool.query(`select 1 from ${tabela} where client_id = $1 and id = $2`, [clientId, id])).rowCount ?? 0) > 0;
    if (v.assetId && !(await existe('assets', v.assetId))) return 'ativo_invalido';
    if (v.motoristaId && !(await existe('motoristas', v.motoristaId))) return 'motorista_invalido';
    if (v.matrizId && !(await existe('viagem_matrizes', v.matrizId))) return 'matriz_invalida';
    for (const c of new Set(v.cercas)) if (!(await existe('cercas', c))) return 'cerca_invalida';
    return null;
  }
}
