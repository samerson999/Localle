import Module from 'node:module';
import path from 'node:path';

/**
 * Faz `require('@localle/shared/x')` funcionar em runtime. O tsc respeita o `paths` do tsconfig na
 * checagem de tipos mas não reescreve o import no JS emitido; como a API importa código de
 * packages/shared, o próprio tsc já compila esses arquivos para `dist/packages/shared/src` (o rootDir é
 * a raiz do monorepo). Daqui, tanto no dist (dist/apps/api/src) quanto rodando do fonte, o caminho
 * relativo até packages/shared/src é o mesmo. Precisa ser o primeiro import do main.ts.
 */
const SHARED = path.resolve(__dirname, '../../../packages/shared/src');
const PREFIXO = '@localle/shared/';

type Resolver = (request: string, ...rest: unknown[]) => string;
const mod = Module as unknown as { _resolveFilename: Resolver };
const original = mod._resolveFilename;
mod._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
  const alvo = request.startsWith(PREFIXO) ? path.join(SHARED, request.slice(PREFIXO.length)) : request;
  return original.call(this, alvo, ...rest);
};
