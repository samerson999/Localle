import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL, pgPoolProvider } from './pg-pool.provider';

@Global()
@Module({
  providers: [pgPoolProvider],
  exports: [pgPoolProvider],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Depois de todos os onModuleDestroy (workers já pararam de usar o banco): fecha as conexões em vez de derrubá-las. */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
