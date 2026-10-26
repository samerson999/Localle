import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';

export interface NotaFiscal {
  litros?: number | null;
  total?: number | null;
  data?: string | null;
  cnpj?: string | null;
  chave?: string | null;
}

export interface AbastecimentoRow {
  id: string;
  client_id: string;
  asset_id: string;
  motorista_id: string | null;
  ts: Date;
  odometro: string;
  litros: string;
  total: string;
  preco_litro: string | null;
  combustivel: string;
  posto: string | null;
  posto_cnpj: string | null;
  km_rastreador: string | null;
  nf: NotaFiscal | null;
  dados: Record<string, string | number>;
  created_at: Date;
  updated_at: Date;
}

export interface AbastecimentoInput {
  assetId: string;
  motoristaId: string | null;
  ts: Date;
  odometro: number;
  litros: number;
  total: number;
  precoLitro: number | null;
  combustivel: string;
  posto: string | null;
  postoCnpj: string | null;
  kmRastreador: number | null;
  nf: NotaFiscal | null;
  dados: Record<string, string | number>;
}

@Injectable()
export class AbastecimentosRepository extends BaseRepository<AbastecimentoRow> {
  protected readonly table = 'abastecimentos';

  async listar(clientId: string, de: Date, ate: Date, assetId: string | null): Promise<AbastecimentoRow[]> {
    const { rows } = await this.pool.query<AbastecimentoRow>(
      `select * from abastecimentos where client_id = $1 and ts >= $2 and ts <= $3 and ($4::uuid is null or asset_id = $4) order by ts desc`,
      [clientId, de, ate, assetId],
    );
    return rows;
  }

  /** Último odômetro lançado antes de `ts` para o ativo — detecta salto de km suspeito. */
  async odometroAnterior(clientId: string, assetId: string, ts: Date, exceto: string | null = null): Promise<number | null> {
    const { rows } = await this.pool.query<{ odometro: string }>(
      `select odometro from abastecimentos where client_id = $1 and asset_id = $2 and ts < $3 and ($4::uuid is null or id <> $4)
       order by ts desc limit 1`,
      [clientId, assetId, ts, exceto],
    );
    return rows[0] ? Number(rows[0].odometro) : null;
  }

  async criar(clientId: string, a: AbastecimentoInput): Promise<AbastecimentoRow | 'ativo_invalido' | 'motorista_invalido'> {
    const erro = await this.validarVinculos(clientId, a);
    if (erro) return erro;
    return this.insert(clientId, this.colunas(a));
  }

  async atualizar(clientId: string, id: string, a: AbastecimentoInput): Promise<AbastecimentoRow | null | 'ativo_invalido' | 'motorista_invalido'> {
    const erro = await this.validarVinculos(clientId, a);
    if (erro) return erro;
    return this.update(clientId, id, { ...this.colunas(a), updated_at: new Date() });
  }

  private async validarVinculos(clientId: string, a: AbastecimentoInput): Promise<'ativo_invalido' | 'motorista_invalido' | null> {
    const ativo = await this.pool.query('select 1 from assets where client_id = $1 and id = $2', [clientId, a.assetId]);
    if (ativo.rowCount === 0) return 'ativo_invalido';
    if (a.motoristaId) {
      const m = await this.pool.query('select 1 from motoristas where client_id = $1 and id = $2', [clientId, a.motoristaId]);
      if (m.rowCount === 0) return 'motorista_invalido';
    }
    return null;
  }

  private colunas(a: AbastecimentoInput) {
    return {
      asset_id: a.assetId,
      motorista_id: a.motoristaId,
      ts: a.ts,
      odometro: a.odometro,
      litros: a.litros,
      total: a.total,
      preco_litro: a.precoLitro,
      combustivel: a.combustivel,
      posto: a.posto,
      posto_cnpj: a.postoCnpj,
      km_rastreador: a.kmRastreador,
      nf: a.nf === null ? null : JSON.stringify(a.nf),
      dados: JSON.stringify(a.dados),
    };
  }
}
