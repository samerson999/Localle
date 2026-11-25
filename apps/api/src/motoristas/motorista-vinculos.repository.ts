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

  /**
   * API pública: vínculos que se sobrepõem ao período (começaram antes do fim e não terminaram antes do início), mais
   * recentes primeiro, keyset por (inicio, id).
   */
  async paginaParaApi(
    clientId: string,
    f: { de: Date; ate: Date; assetId: string | null; motoristaId: string | null; apos: { ts: Date; id: string } | null; limite: number },
  ): Promise<MotoristaVinculoRow[]> {
    const { rows } = await this.pool.query<MotoristaVinculoRow>(
      `select * from motorista_vinculos
        where client_id = $1 and inicio <= $3 and (fim is null or fim >= $2)
          and ($4::uuid is null or asset_id = $4) and ($5::uuid is null or motorista_id = $5)
          and ($6::timestamptz is null or (date_trunc('milliseconds', inicio), id) < ($6, $7::uuid))
        order by date_trunc('milliseconds', inicio) desc, id desc limit $8`,
      [clientId, f.de, f.ate, f.assetId, f.motoristaId, f.apos?.ts ?? null, f.apos?.id ?? null, f.limite + 1],
    );
    return rows;
  }

  /** Ids dos ativos com leitor de cartão marcado na instalação principal vigente. */
  async ativosComLeitor(clientId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ asset_id: string }>(
      `select distinct asset_id from instalacoes
        where client_id = $1 and desinstalado_em is null and papel = 'principal' and leitor_motorista`,
      [clientId],
    );
    return rows.map((r) => r.asset_id);
  }
}
