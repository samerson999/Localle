import { Pool } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

export const pgPoolProvider = {
  provide: PG_POOL,
  useFactory: () =>
    new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX) || 10,
    }),
};
