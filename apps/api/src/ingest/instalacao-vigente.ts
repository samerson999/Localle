import type { Queryable } from '../db/queryable';

export type PapelInstalacao = 'principal' | 'backup';

/**
 * Dono de um dado de telemetria = instalação vigente no instante do dado (não "agora"): pacote atrasado de antes de uma
 * troca de cliente continua indo para o cliente anterior. A exclusion constraint de `instalacoes` garante no máximo uma
 * linha por rastreador. Usado pela ingestão de posições e de eventos.
 *
 * Principal e backup têm dono; o papel `can` continua sem dono aqui (módulo CAN não é fonte de posição). Quem chama
 * decide o que o backup alimenta: ele comunica, mas não move o ativo (mapa, cercas, regras, alertas).
 */
export async function resolverInstalacaoVigente(
  executor: Queryable,
  rastreadorId: string,
  instante: Date,
): Promise<{ clientId: string | null; assetId: string | null; instalacaoId: string | null; papel: PapelInstalacao | null }> {
  const { rows } = await executor.query<{ id: string; client_id: string; asset_id: string; papel: PapelInstalacao }>(
    `select id, client_id, asset_id, papel from instalacoes
     where rastreador_id = $1 and papel in ('principal', 'backup')
       and instalado_em <= $2 and (desinstalado_em is null or desinstalado_em > $2)
     order by instalado_em desc limit 1`,
    [rastreadorId, instante],
  );
  const r = rows[0];
  return { clientId: r?.client_id ?? null, assetId: r?.asset_id ?? null, instalacaoId: r?.id ?? null, papel: r?.papel ?? null };
}
