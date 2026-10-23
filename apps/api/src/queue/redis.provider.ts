import IORedis from 'ioredis';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');

export const redisConnectionProvider = {
  provide: REDIS_CONNECTION,
  useFactory: () =>
    new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // exigido pelo BullMQ (ver docs do próprio BullMQ)
    }),
};
