import './shared-alias';
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOrigin } from './common/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: corsOrigin(process.env.APP_URL) });
  // SIGTERM do deploy (Coolify/docker stop) chama os onModuleDestroy: o worker do inbox termina a linha em andamento e
  // devolve o resto do lote, a conciliação para entre rastreadores, e o pool fecha por último (DbModule). Sem isto o
  // processo morria no meio e as linhas reivindicadas ficavam presas até o lease vencer (2 min sem ingestão).
  app.enableShutdownHooks();
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}

bootstrap();
