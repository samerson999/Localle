import type { TipoChave } from '../chaves/chave';

/** Metadado das rotas `@ApiPublica()` — separado do decorator para o `AuthGuard` ler sem importar o guard da API. */
export const API_PUBLICA_KEY = 'localle:api-publica';

/** Valor do metadado nas rotas que só a chave mestra usa, sem cliente (ex.: `GET /v1/clientes`). */
export const SO_MESTRA = '__so_mestra__';

/** O que o `ApiChaveGuard` resolveu para a requisição (`request.apiAuth`). */
export interface ApiAuth {
  tipo: TipoChave;
  chaveId: string;
  /** `null` só nas rotas `SO_MESTRA`. */
  clientId: string | null;
}
