import type { Queryable } from '../db/queryable';

/**
 * Dono de um dado de telemetria = instalação principal vigente no instante do dado (não "agora"): pacote
 * atrasado de antes de uma troca de cliente continua indo para o cliente anterior. A exclusion
 * constraint de `instalacoes` garante no máximo uma linha. Usado pela ingestão de posições e de eventos.
 */
export async function resolverInstalacaoVigente(
  executor: Queryable,
  rastreadorId: string,
  instante: Date,
): Promise<{ clientId: string | null; assetId: string | null }> {
  const { rows } = await executor.query<{ client_id: string; asset_id: string }>(
    `select client_id, asset_id from instalacoes
     where rastreador_id = $1 and papel = 'principal'
       and instalado_em <= $2 and (desinstalado_em is null or desinstalado_em > $2)
     order by instalado_em desc limit 1`,
    [rastreadorId, instante],
  );
  return { clientId: rows[0]?.client_id ?? null, assetId: rows[0]?.asset_id ?? null };
}
