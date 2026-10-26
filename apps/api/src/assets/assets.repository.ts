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
    data: { plate: string | null; status: AssetStatus | null },
  ): Promise<AssetEntity | null> {
    const { rows } = await this.pool.query<AssetEntity>(
      `update assets set
         plate = coalesce($3, plate),
         status_desde = case when $4::text is not null and $4::text <> status then now() else status_desde end,
         status = coalesce($4, status),
         updated_at = now()
       where client_id = $1 and id = $2
       returning *`,
      [clientId, id, data.plate, data.status],
    );
    return rows[0] ?? null;
  }
}
