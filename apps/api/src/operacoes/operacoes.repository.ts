import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';

export interface OperacaoRow {
  id: string;
  client_id: string;
  nome: string;
  meta_kml: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Operacao {
  id: string;
  nome: string;
  metaKml: number | null;
}

const paraOperacao = (r: OperacaoRow): Operacao => ({ id: r.id, nome: r.nome, metaKml: r.meta_kml === null ? null : Number(r.meta_kml) });

/** Operações do cliente (contrato/tipo de operação): o ativo aponta para uma (`assets.operacao_id`) e a meta de consumo dela entra na hierarquia de metas. */
@Injectable()
export class OperacoesRepository extends BaseRepository<OperacaoRow> {
  protected readonly table = 'operacoes';

  async listar(clientId: string): Promise<Operacao[]> {
    const { rows } = await this.pool.query<OperacaoRow>('select * from operacoes where client_id = $1 order by nome', [clientId]);
    return rows.map(paraOperacao);
  }

  async criar(clientId: string, o: { nome: string; metaKml: number | null }): Promise<Operacao> {
    return paraOperacao(await this.insert(clientId, { nome: o.nome, meta_kml: o.metaKml }));
  }

  async atualizar(clientId: string, id: string, o: { nome: string; metaKml: number | null }): Promise<Operacao | null> {
    const row = await this.update(clientId, id, { nome: o.nome, meta_kml: o.metaKml, updated_at: new Date() });
    return row ? paraOperacao(row) : null;
  }
}
