import { Global, Module } from '@nestjs/common';
import { pgPoolProvider } from './pg-pool.provider';

@Global()
@Module({
  providers: [pgPoolProvider],
  exports: [pgPoolProvider],
})
export class DbModule {}
