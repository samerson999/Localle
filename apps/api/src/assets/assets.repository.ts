import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';
import type { AssetEntity, AssetStatus } from './asset.entity';

@Injectable()
export class AssetsRepository extends BaseRepository<AssetEntity> {
  protected readonly table = 'assets';

  /** `status_desde` só muda quando o status de fato muda — reenviar o mesmo status não reescreve a data. */
  async atualizar(
    clientId: string,
    id: string,
    data: { plate: string | null; status: AssetStatus | null; motoristaId?: string | null },
  ): Promise<AssetEntity | null | 'motorista_invalido'> {
    // motorista precisa ser do mesmo cliente (sem IDOR por motoristaId); ausente → não mexe; null → limpa
    if (data.motoristaId) {
      const m = await this.pool.query('select 1 from motoristas where client_id = $1 and id = $2 and desativado_em is null', [clientId, data.motoristaId]);
      if (m.rowCount === 0) return 'motorista_invalido';
    }
    const { rows } = await this.pool.query<AssetEntity>(
      `update assets set
         plate = coalesce($3, plate),
         status_desde = case when $4::text is not null and $4::text <> status then now() else status_desde end,
         status = coalesce($4, status),
         motorista_id = case when $5 then $6::uuid else motorista_id end,
         updated_at = now()
       where client_id = $1 and id = $2
       returning *`,
      [clientId, id, data.plate, data.status, data.motoristaId !== undefined, data.motoristaId ?? null],
    );
    return rows[0] ?? null;
  }
}
