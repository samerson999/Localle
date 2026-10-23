import { Controller, Get, Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import { Public } from '../auth/public.decorator';
import { PG_POOL } from '../db/pg-pool.provider';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  @Public()
  async check() {
    await this.pool.query('select 1');
    return { status: 'ok', db: 'ok' };
  }
}
