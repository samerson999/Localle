import type { PoolClient } from 'pg';
import type { EventoGravado } from '../ingest/positions-ingest.service';
import type { NormalizedPosition } from '../ingest/traccar-position.mapper';
import { regraAtende, type Condicao } from './avaliar-regra';

/** Mesmo intervalo da simulação: a mesma regra no mesmo ativo não alerta de novo antes disso. */
export const INTERVALO_REPETICAO_MIN = 15;

interface RegraAtiva {
  id: string;
  nome: string;
  prioridade: 'alta' | 'media' | 'baixa';
  condicoes: Condicao[];
  acoes: { painel?: boolean; ranking?: boolean };
}

/**
 * Avalia as regras ativas do cliente sobre a posição recém-gravada (mesma transação). Só deve ser chamada
 * para a posição mais nova do ativo — avaliar posição atrasada dispararia alerta com estado velho.
 * O intervalo de repetição é contado no horário da posição e travado por `regra_disparos` (upsert com
 * `where`), então duas posições do mesmo ativo processadas em paralelo não disparam em dobro.
 */
export async function avaliarRegras(
  client: PoolClient,
  p: { clientId: string; assetId: string; rastreadorId: string; posicaoId: string; position: NormalizedPosition },
): Promise<EventoGravado[]> {
  const { rows: regras } = await client.query<RegraAtiva>(
    'select id, nome, prioridade, condicoes, acoes from regras where client_id = $1 and ativa and removida_em is null',
    [p.clientId],
  );
  if (regras.length === 0) return [];

  const { rows: tipos } = await client.query<{ tipo: string }>(
    `select distinct c.tipo from cerca_presenca cp join cercas c on c.id = cp.cerca_id
     where cp.asset_id = $1 and cp.client_id = $2`,
    [p.assetId, p.clientId],
  );
  const ctx = {
    fixTime: p.position.fixTime,
    speedKmh: p.position.speedKmh,
    ignition: p.position.ignition,
    tiposCercaDentro: tipos.map((t) => t.tipo),
    alarms: p.position.alarms,
    attributes: p.position.attributes,
  };

  const eventos: EventoGravado[] = [];
  for (const regra of regras) {
    if (!regraAtende(regra.condicoes, ctx)) continue;
    const disparo = await client.query(
      `insert into regra_disparos (regra_id, asset_id, ultimo_em) values ($1, $2, $3)
       on conflict (regra_id, asset_id) do update set ultimo_em = excluded.ultimo_em
       where regra_disparos.ultimo_em <= excluded.ultimo_em - make_interval(mins => $4)
       returning regra_id`,
      [regra.id, p.assetId, p.position.fixTime, INTERVALO_REPETICAO_MIN],
    );
    if (disparo.rowCount === 0) continue;

    const attributes = { regraId: regra.id, nome: regra.nome, ranking: !!regra.acoes.ranking };
    const { rows } = await client.query<{ id: string }>(
      `insert into eventos (rastreador_id, client_id, asset_id, origem, tipo, ts, posicao_id, attributes)
       values ($1, $2, $3, 'regra', 'regra', $4, $5, $6) returning id`,
      [p.rastreadorId, p.clientId, p.assetId, p.position.fixTime, p.posicaoId, attributes],
    );
    eventos.push({
      id: rows[0].id,
      tipo: 'regra',
      ts: p.position.fixTime,
      attributes,
      alerta: regra.acoes.painel ? { titulo: regra.nome, prioridade: regra.prioridade } : null,
    });
  }
  return eventos;
}
