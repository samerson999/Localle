import './shared-alias';
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { registrarSwagger } from './api-publica/swagger';
import { corsOrigin } from './common/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Proxies na frente da API (Traefik do Coolify → Nginx do web): sem isto `req.ip` é o do Nginx, e a lista de IPs da
  // chave mestra da API pública (api-publica/auth/ip.ts) não funciona. Padrão 0 (dev, acesso direto).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));
  app.enableCors({ origin: corsOrigin(process.env.APP_URL) });
  // SIGTERM do deploy (Coolify/docker stop) chama os onModuleDestroy: o worker do inbox termina a linha em andamento e
  // devolve o resto do lote, a conciliação para entre rastreadores, e o pool fecha por último (DbModule). Sem isto o
  // processo morria no meio e as linhas reivindicadas ficavam presas até o lease vencer (2 min sem ingestão).
  app.enableShutdownHooks();
  registrarSwagger(app);
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}

bootstrap();
