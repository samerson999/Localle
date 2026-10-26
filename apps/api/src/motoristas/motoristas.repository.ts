import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';

export type Regime = 'cargas' | 'passageiros';

export interface MotoristaRow {
  id: string;
  client_id: string;
  nome: string;
  cnh: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  toxicologico_validade: string | null;
  telefone: string | null;
  regime: Regime;
  ear: boolean;
  desativado_em: Date | null;
  dados: Record<string, string | number>;
  created_at: Date;
  updated_at: Date;
}

export interface MotoristaInput {
  nome: string;
  cnh: string | null;
  cnhCategoria: string | null;
  cnhValidade: string | null;
  toxicologicoValidade: string | null;
  telefone: string | null;
  regime: Regime;
  ear: boolean;
  dados: Record<string, string | number>;
}

@Injectable()
export class MotoristasRepository extends BaseRepository<MotoristaRow> {
  protected readonly table = 'motoristas';

  /** Ativos por padrão; `incluirInativos` traz os desativados (histórico de multas/jornada continua apontando para eles). */
  async listar(clientId: string, incluirInativos: boolean): Promise<MotoristaRow[]> {
    const { rows } = await this.pool.query<MotoristaRow>(
      `select *, cnh_validade::text, toxicologico_validade::text from motoristas
       where client_id = $1 and ($2 or desativado_em is null) order by nome`,
      [clientId, incluirInativos],
    );
    return rows;
  }

  async buscar(clientId: string, id: string): Promise<MotoristaRow | null> {
    const { rows } = await this.pool.query<MotoristaRow>(
      'select *, cnh_validade::text, toxicologico_validade::text from motoristas where client_id = $1 and id = $2',
      [clientId, id],
    );
    return rows[0] ?? null;
  }

  criar(clientId: string, m: MotoristaInput): Promise<MotoristaRow> {
    return this.insert(clientId, this.colunas(m));
  }

  async atualizar(clientId: string, id: string, m: MotoristaInput): Promise<MotoristaRow | null> {
    const row = await this.update(clientId, id, { ...this.colunas(m), updated_at: new Date() });
    return row ? this.buscar(clientId, id) : null;
  }

  async setDesativado(clientId: string, id: string, desativado: boolean): Promise<MotoristaRow | null> {
    const row = await this.update(clientId, id, { desativado_em: desativado ? new Date() : null, updated_at: new Date() });
    return row ? this.buscar(clientId, id) : null;
  }

  private colunas(m: MotoristaInput) {
    return {
      nome: m.nome,
      cnh: m.cnh,
      cnh_categoria: m.cnhCategoria,
      cnh_validade: m.cnhValidade,
      toxicologico_validade: m.toxicologicoValidade,
      telefone: m.telefone,
      regime: m.regime,
      ear: m.ear,
      dados: JSON.stringify(m.dados),
    };
  }
}
