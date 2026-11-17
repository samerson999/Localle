import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';
import type { EncerradoPor } from './identificacao-motorista';

export interface MotoristaVinculoRow {
  id: string;
  client_id: string;
  asset_id: string;
  /** null = código lido pelo rastreador que ainda não está cadastrado em nenhum motorista. */
  motorista_id: string | null;
  origem: 'rastreador' | 'app' | 'escala';
  codigo: string | null;
  rastreador_id: string | null;
  inicio: Date;
  fim: Date | null;
  encerrado_por: EncerradoPor | null;
  criado_em: Date;
}

/** Limite de linhas por leitura: a tela mostra histórico recente, não exportação. */
const LIMITE = 5000;

/**
 * Histórico motorista × veículo (migration 1794390000000). Quem grava os de origem `rastreador` é a ingestão
 * (identificacao-motorista.ts, dentro da transação da posição); aqui é só leitura para as telas.
 */
@Injectable()
export class MotoristaVinculosRepository extends BaseRepository<MotoristaVinculoRow> {
  protected readonly table = 'motorista_vinculos';

  /** Vínculos abertos e os que começaram desde `desde`, mais recentes primeiro. */
  async listar(clientId: string, desde: Date): Promise<MotoristaVinculoRow[]> {
    const { rows } = await this.pool.query<MotoristaVinculoRow>(
      `select * from motorista_vinculos
        where client_id = $1 and (fim is null or inicio >= $2)
        order by inicio desc limit $3`,
      [clientId, desde, LIMITE],
    );
    return rows;
  }
}
