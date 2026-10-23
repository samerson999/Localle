import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';
import type { AssetEntity } from './asset.entity';

@Injectable()
export class AssetsRepository extends BaseRepository<AssetEntity> {
  protected readonly table = 'assets';
}
