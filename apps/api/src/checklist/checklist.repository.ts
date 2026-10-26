import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export const TIPOS_PERGUNTA = ['sim_nao', 'nota', 'km', 'data', 'datahora', 'texto', 'foto', 'multipla'] as const;
export const TIPOS_AGENDA = ['diario', 'semanal', 'mensal', 'ciclo', 'datas'] as const;

export interface Pergunta {
  id: string;
  label: string;
  type: (typeof TIPOS_PERGUNTA)[number];
  required?: boolean;
  requirePhoto?: boolean;
  options?: string[];
  flagValues?: string[];
  scaleMax?: number;
  flagBelow?: number;
}

export interface Agenda {
  type: (typeof TIPOS_AGENDA)[number];
  weekday?: number;
  monthDay?: number;
  cycleDays?: number;
  startDate?: string;
  dates?: string[];
  sundays?: boolean;
}

export interface ModeloRow {
  id: string;
  client_id: string;
  nome: string;
  ativo: boolean;
  agenda: Agenda;
  alvos: { groupIds: string[]; personIds: string[] };
  perguntas: Pergunta[];
  created_at: Date;
  updated_at: Date;
}

export interface ModeloInput {
  nome: string;
  ativo: boolean;
  agenda: Agenda;
  alvos: { groupIds: string[]; personIds: string[] };
  perguntas: Pergunta[];
}

export interface RespostaRow {
  id: string;
  client_id: string;
  modelo_id: string;
  motorista_id: string | null;
  asset_id: string | null;
  respondente: string | null;
  iniciado_em: Date;
  finalizado_em: Date;
  respostas: Record<string, { value: unknown; photo?: string }>;
  nao_conformidades: number;
  created_at: Date;
}

export interface RespostaInput {
  modeloId: string;
  motoristaId: string | null;
  assetId: string | null;
  respondente: string | null;
  iniciadoEm: Date;
  finalizadoEm: Date;
  respostas: Record<string, { value: unknown; photo?: string }>;
}

@Injectable()
export class ChecklistRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listarModelos(clientId: string): Promise<ModeloRow[]> {
    const { rows } = await this.pool.query<ModeloRow>('select * from checklist_modelos where client_id = $1 order by nome', [clientId]);
    return rows;
  }

  async buscarModelo(clientId: string, id: string): Promise<ModeloRow | null> {
    const { rows } = await this.pool.query<ModeloRow>('select * from checklist_modelos where client_id = $1 and id = $2', [clientId, id]);
    return rows[0] ?? null;
  }

  async salvarModelo(clientId: string, m: ModeloInput, id: string | null): Promise<ModeloRow | null> {
    const valores = [clientId, m.nome, m.ativo, JSON.stringify(m.agenda), JSON.stringify(m.alvos), JSON.stringify(m.perguntas)];
    if (id) {
      const { rows } = await this.pool.query<ModeloRow>(
        `update checklist_modelos set nome = $2, ativo = $3, agenda = $4::jsonb, alvos = $5::jsonb, perguntas = $6::jsonb, updated_at = now()
         where client_id = $1 and id = $7 returning *`,
        [...valores, id],
      );
      return rows[0] ?? null;
    }
    const { rows } = await this.pool.query<ModeloRow>(
      `insert into checklist_modelos (client_id, nome, ativo, agenda, alvos, perguntas) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb) returning *`,
      valores,
    );
    return rows[0];
  }

  async removerModelo(clientId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from checklist_modelos where client_id = $1 and id = $2', [clientId, id]);
    return (rowCount ?? 0) > 0;
  }

  async listarRespostas(clientId: string, de: Date, ate: Date, modeloId: string | null): Promise<RespostaRow[]> {
    const { rows } = await this.pool.query<RespostaRow>(
      `select * from checklist_respostas where client_id = $1 and finalizado_em >= $2 and finalizado_em <= $3 and ($4::uuid is null or modelo_id = $4)
       order by finalizado_em desc limit 2000`,
      [clientId, de, ate, modeloId],
    );
    return rows;
  }

  /** Motorista/ativo de outro cliente viram `null` de propósito? Não: são recusados — o registro apontaria para dado alheio. */
  async criarResposta(clientId: string, r: RespostaInput, naoConformidades: number): Promise<RespostaRow | 'modelo_invalido' | 'motorista_invalido' | 'ativo_invalido'> {
    const modelo = await this.pool.query('select 1 from checklist_modelos where client_id = $1 and id = $2', [clientId, r.modeloId]);
    if (modelo.rowCount === 0) return 'modelo_invalido';
    if (r.motoristaId && (await this.pool.query('select 1 from motoristas where client_id = $1 and id = $2', [clientId, r.motoristaId])).rowCount === 0) return 'motorista_invalido';
    if (r.assetId && (await this.pool.query('select 1 from assets where client_id = $1 and id = $2', [clientId, r.assetId])).rowCount === 0) return 'ativo_invalido';
    const { rows } = await this.pool.query<RespostaRow>(
      `insert into checklist_respostas (client_id, modelo_id, motorista_id, asset_id, respondente, iniciado_em, finalizado_em, respostas, nao_conformidades)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) returning *`,
      [clientId, r.modeloId, r.motoristaId, r.assetId, r.respondente, r.iniciadoEm, r.finalizadoEm, JSON.stringify(r.respostas), naoConformidades],
    );
    return rows[0];
  }
}
