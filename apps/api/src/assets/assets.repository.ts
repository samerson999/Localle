import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';
import { isPgError, PG_CHECK_VIOLATION, PG_FOREIGN_KEY_VIOLATION } from '../db/pg-errors';
import type { AssetEntity } from './asset.entity';
import type { UpdateAssetData } from './dto/update-asset.dto';

/** Linha da listagem da API pública: o ativo com marca/modelo do catálogo e os grupos. */
export type AssetParaApi = AssetEntity & { marca_nome: string | null; modelo_nome: string | null; grupo_ids: string[] };

@Injectable()
export class AssetsRepository extends BaseRepository<AssetEntity> {
  protected readonly table = 'assets';

  /**
   * Página da API pública (docs/PLANO-API-PUBLICA.md § 4): ordem estável por (rótulo, id), cursor keyset — nunca offset.
   * Devolve `limite + 1` linhas para quem monta a página saber se há próxima.
   */
  async paginaParaApi(
    clientId: string,
    f: { limite: number; apos: { rotulo: string; id: string } | null; incluirInativos: boolean; placa?: string; identificador?: string; id?: string },
  ): Promise<AssetParaApi[]> {
    const { rows } = await this.pool.query<AssetParaApi>(
      `select a.*, mc.nome as marca_nome, md.nome as modelo_nome,
              coalesce((select array_agg(m.group_id order by m.group_id) from asset_group_members m
                         join asset_groups g on g.id = m.group_id and g.client_id = a.client_id
                        where m.asset_id = a.id), '{}') as grupo_ids
         from assets a
         left join ativo_modelos md on md.id = a.modelo_id and md.client_id = a.client_id
         left join ativo_marcas mc on mc.id = md.marca_id and mc.client_id = a.client_id
        where a.client_id = $1
          and ($2 or a.status = 'ativo')
          and ($3::text is null or upper(replace(a.plate, '-', '')) = upper(replace($3, '-', '')))
          and ($4::text is null or a.identificador = $4)
          and ($5::uuid is null or a.id = $5)
          and ($6::text is null or (a.rotulo, a.id) > ($6, $7::uuid))
        order by a.rotulo, a.id
        limit $8`,
      [clientId, f.incluirInativos, f.placa ?? null, f.identificador ?? null, f.id ?? null, f.apos?.rotulo ?? null, f.apos?.id ?? null, f.limite + 1],
    );
    return rows;
  }

  /** `status_desde` só muda quando o status de fato muda — reenviar o mesmo status não reescreve a data. */
  async atualizar(
    clientId: string,
    id: string,
    data: UpdateAssetData,
  ): Promise<AssetEntity | null | 'motorista_invalido' | 'operacao_invalida' | 'modelo_invalido' | 'sem_identificacao'> {
    // motorista precisa ser do mesmo cliente (sem IDOR por motoristaId); ausente → não mexe; null → limpa
    if (data.motoristaId) {
      const m = await this.pool.query('select 1 from motoristas where client_id = $1 and id = $2 and desativado_em is null', [clientId, data.motoristaId]);
      if (m.rowCount === 0) return 'motorista_invalido';
    }
    // idem para a operação: a FK sozinha aceitaria a operação de outro cliente
    if (data.operacaoId) {
      const o = await this.pool.query('select 1 from operacoes where client_id = $1 and id = $2', [clientId, data.operacaoId]);
      if (o.rowCount === 0) return 'operacao_invalida';
    }
    try {
      return await this.gravar(clientId, id, data);
    } catch (e: any) {
      // limpar a placa de quem não tem identificador (ou o contrário) deixaria o ativo sem nome
      if (isPgError(e, PG_CHECK_VIOLATION) && e.constraint === 'assets_placa_ou_identificador') return 'sem_identificacao';
      // FK composta (client_id, modelo_id): modelo inexistente ou de outro cliente
      if (isPgError(e, PG_FOREIGN_KEY_VIOLATION) && e.constraint === 'assets_modelo_fk') return 'modelo_invalido';
      throw e;
    }
  }

  private async gravar(clientId: string, id: string, data: UpdateAssetData): Promise<AssetEntity | null> {
    const { rows } = await this.pool.query<AssetEntity>(
      `update assets set
         plate = case when $12 then $3::text else plate end,
         identificador = case when $13 then $14::text else identificador end,
         status_desde = case when $4::text is not null and $4::text <> status then now() else status_desde end,
         status = coalesce($4, status),
         motorista_id = case when $5 then $6::uuid else motorista_id end,
         icone = case when $7 then $8::text else icone end,
         dados = coalesce($9::jsonb, dados),
         operacao_id = case when $10 then $11::uuid else operacao_id end,
         modelo_id = case when $15 then $16::uuid else modelo_id end,
         updated_at = now()
       where client_id = $1 and id = $2
       returning *`,
      [clientId, id, data.plate ?? null, data.status, data.motoristaId !== undefined, data.motoristaId ?? null, data.icone !== undefined, data.icone ?? null,
        data.dados === undefined ? null : JSON.stringify(data.dados), data.operacaoId !== undefined, data.operacaoId ?? null,
        data.plate !== undefined, data.identificador !== undefined, data.identificador ?? null,
        data.modeloId !== undefined, data.modeloId ?? null],
    );
    return rows[0] ?? null;
  }
}
