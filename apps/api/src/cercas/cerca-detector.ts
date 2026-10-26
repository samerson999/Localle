import type { PoolClient } from 'pg';
import { prioridadeDaCerca, type PrioridadeAlerta } from './cerca.entity';

export interface EventoCerca {
  id: string;
  tipo: 'cerca_entrada' | 'cerca_saida';
  ts: Date;
  attributes: { cercaId: string; nome: string; tipo: string };
  /** Presente só quando a cerca pede alerta nesse sentido — o front não decide isso. */
  alerta: { titulo: string; prioridade: PrioridadeAlerta } | null;
}

interface CercaAtingida {
  id: string;
  nome: string;
  tipo: string;
  alerta_entrada: boolean;
  alerta_saida: boolean;
  prioridade_alerta: PrioridadeAlerta | null;
}

/**
 * Entrada/saída de cerca (mesma semântica de `fenceCrossing` em packages/shared/src/engine.ts, que a
 * simulação usa), calculada no banco sobre a posição recém-gravada e na mesma transação dela.
 *
 * Ordem: só avalia posição mais nova que a última avaliada do ativo (`cerca_avaliacao`). O upsert com
 * `where` trava a linha do ativo, então duas posições do mesmo ativo em paralelo são serializadas; uma
 * posição atrasada não faz o estado andar para trás. Limitação conhecida: uma passada rápida entre duas
 * posições (entrou e saiu sem nenhuma posição dentro) não é vista — vale para qualquer cálculo por ponto.
 */
export async function detectarCercas(
  client: PoolClient,
  p: { clientId: string; assetId: string; rastreadorId: string; posicaoId: string; fixTime: Date; longitude: number; latitude: number },
): Promise<EventoCerca[]> {
  const avaliacao = await client.query(
    `insert into cerca_avaliacao (asset_id, fix_time) values ($1, $2)
     on conflict (asset_id) do update set fix_time = excluded.fix_time
     where cerca_avaliacao.fix_time < excluded.fix_time
     returning asset_id`,
    [p.assetId, p.fixTime],
  );
  if (avaliacao.rowCount === 0) return [];

  const ponto = 'st_setsrid(st_makepoint($2, $3), 4326)';
  const { rows: dentro } = await client.query<CercaAtingida>(
    `select id, nome, tipo, alerta_entrada, alerta_saida, prioridade_alerta from cercas
     where client_id = $1 and removida_em is null
       and case forma
             when 'circulo' then st_dwithin(centro::geography, ${ponto}::geography, raio_m)
             else st_covers(poligono, ${ponto})
           end`,
    [p.clientId, p.longitude, p.latitude],
  );
  const { rows: antes } = await client.query<CercaAtingida>(
    `select c.id, c.nome, c.tipo, c.alerta_entrada, c.alerta_saida, c.prioridade_alerta
     from cerca_presenca cp join cercas c on c.id = cp.cerca_id
     where cp.asset_id = $1 and cp.client_id = $2`,
    [p.assetId, p.clientId],
  );

  const idsDentro = new Set(dentro.map((c) => c.id));
  const idsAntes = new Set(antes.map((c) => c.id));
  const entrou = dentro.filter((c) => !idsAntes.has(c.id));
  const saiu = antes.filter((c) => !idsDentro.has(c.id));

  const eventos: EventoCerca[] = [];
  for (const c of entrou) {
    await client.query(
      'insert into cerca_presenca (asset_id, cerca_id, client_id, desde) values ($1, $2, $3, $4) on conflict do nothing',
      [p.assetId, c.id, p.clientId, p.fixTime],
    );
    eventos.push(await gravar(client, p, c, 'cerca_entrada'));
  }
  for (const c of saiu) {
    await client.query('delete from cerca_presenca where asset_id = $1 and cerca_id = $2', [p.assetId, c.id]);
    eventos.push(await gravar(client, p, c, 'cerca_saida'));
  }
  return eventos;
}

async function gravar(
  client: PoolClient,
  p: { clientId: string; assetId: string; rastreadorId: string; posicaoId: string; fixTime: Date },
  c: CercaAtingida,
  tipo: EventoCerca['tipo'],
): Promise<EventoCerca> {
  const attributes = { cercaId: c.id, nome: c.nome, tipo: c.tipo };
  const { rows } = await client.query<{ id: string }>(
    `insert into eventos (rastreador_id, client_id, asset_id, origem, tipo, ts, posicao_id, attributes)
     values ($1, $2, $3, 'regra', $4, $5, $6, $7) returning id`,
    [p.rastreadorId, p.clientId, p.assetId, tipo, p.fixTime, p.posicaoId, attributes],
  );
  const pedeAlerta = tipo === 'cerca_entrada' ? c.alerta_entrada : c.alerta_saida;
  return {
    id: rows[0].id,
    tipo,
    ts: p.fixTime,
    attributes,
    alerta: pedeAlerta
      ? {
          titulo: tipo === 'cerca_entrada' ? `Entrada em ${c.nome}` : `Saída de ${c.nome}`,
          prioridade: prioridadeDaCerca({ tipo: c.tipo, prioridadeAlerta: c.prioridade_alerta }),
        }
      : null,
  };
}
