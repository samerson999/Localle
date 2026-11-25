/**
 * Escopo de veículos por usuário (Setup › Equipe, 25/11/2026). O admin pode restringir uma pessoa a alguns grupos e
 * operações; o `AuthGuard` resolve, a cada requisição, os veículos que ela vê (`request.auth.ativos`, `null` = todos).
 *
 * Como a regra vale para todo o sistema (mapa, relatórios, alertas, módulos), ela é aplicada num ponto só, pelo
 * formato do dado e não tela a tela — `EscopoInterceptor`:
 * - na entrada, `assetId`/`assetIds`/`asset_id` (rota, query ou corpo) fora do escopo respondem 404, como um veículo
 *   de outro cliente;
 * - na saída, a resposta que é um registro de veículo fora do escopo vira 404; todo item de lista que carrega `assetId`/`asset_id` de veículo fora do escopo sai da resposta, e listas
 *   `assetIds` perdem os ids de fora.
 * O que não carrega o id do veículo (a lista de ativos, que usa `id`; totais agregados) é tratado no próprio módulo.
 */

const CHAVES_ID = ['assetId', 'asset_id'] as const;
const CHAVES_LISTA = ['assetIds', 'asset_ids'] as const;
const PROFUNDIDADE_MAX = 8;

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);

function idDoItem(v: unknown): string | null | undefined {
  if (!ehObjeto(v)) return undefined;
  for (const k of CHAVES_ID) {
    if (k in v) return typeof v[k] === 'string' ? (v[k] as string) : null;
  }
  return undefined;
}

/** Resposta que é UM registro de veículo fora do escopo (ex.: `GET /multas/:id`) — vira 404. */
export function registroForaDoEscopo(valor: unknown, ativos: ReadonlySet<string>): boolean {
  const id = idDoItem(valor);
  return typeof id === 'string' && !ativos.has(id);
}

/** Tira da resposta o que é de veículo fora do escopo. Não muda o objeto recebido. */
export function filtrarPorEscopo<T>(valor: T, ativos: ReadonlySet<string>, profundidade = 0): T {
  if (profundidade > PROFUNDIDADE_MAX) return valor;
  if (Array.isArray(valor)) {
    return valor
      .filter((item) => {
        const id = idDoItem(item);
        return typeof id !== 'string' || ativos.has(id);
      })
      .map((item) => filtrarPorEscopo(item, ativos, profundidade + 1)) as T;
  }
  if (!ehObjeto(valor)) return valor;
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor)) {
    if ((CHAVES_LISTA as readonly string[]).includes(k) && Array.isArray(v)) saida[k] = v.filter((id) => typeof id !== 'string' || ativos.has(id));
    else saida[k] = filtrarPorEscopo(v, ativos, profundidade + 1);
  }
  return saida as T;
}

function idsDe(v: unknown): string[] {
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

/** Ids de veículo que o pedido menciona (rota, query e corpo). */
export function idsDoPedido(req: { params?: unknown; query?: unknown; body?: unknown }): string[] {
  const ids: string[] = [];
  for (const fonte of [req.params, req.query, req.body]) {
    if (!ehObjeto(fonte)) continue;
    for (const k of [...CHAVES_ID, ...CHAVES_LISTA]) ids.push(...idsDe(fonte[k]));
  }
  return ids;
}
