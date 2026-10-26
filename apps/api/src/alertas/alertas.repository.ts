import { Injectable } from '@nestjs/common';
import type { Alerta } from '@localle/shared/realtime';
import { BaseRepository } from '../db/base.repository';
import type { Queryable } from '../db/queryable';

interface AlertaRow {
  id: string;
  client_id: string;
  asset_id: string | null;
  origem: Alerta['origem'];
  tipo: string;
  titulo: string;
  detalhe: string | null;
  prioridade: Alerta['prioridade'];
  ts: Date;
  lido_em: Date | null;
  tratado_em: Date | null;
  tratado_por_email: string | null;
  tratamento_motivo: string | null;
  tratamento_obs: string | null;
}

export interface NovoAlerta {
  clientId: string;
  assetId: string | null;
  eventoId: string | null;
  origem: Alerta['origem'];
  tipo: string;
  titulo: string;
  detalhe: string | null;
  prioridade: Alerta['prioridade'];
  ts: Date;
}

const SELECT = `
  select a.id, a.client_id, a.asset_id, a.origem, a.tipo, a.titulo, a.detalhe, a.prioridade, a.ts,
    a.lido_em, a.tratado_em, u.email as tratado_por_email, a.tratamento_motivo, a.tratamento_obs
  from alertas a left join users u on u.id = a.tratado_por`;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toAlerta(r: AlertaRow): Alerta {
  return {
    id: r.id,
    assetId: r.asset_id,
    origem: r.origem,
    tipo: r.tipo,
    titulo: r.titulo,
    detalhe: r.detalhe,
    prioridade: r.prioridade,
    ts: r.ts.toISOString(),
    lidoEm: iso(r.lido_em),
    tratadoEm: iso(r.tratado_em),
    tratadoPor: r.tratado_por_email,
    motivo: r.tratamento_motivo,
    obs: r.tratamento_obs,
  };
}

/**
 * Chamada de dentro da transação da ingestão (alarme do aparelho, cerca, regra): o alerta nasce junto com
 * o evento ou não nasce. Função solta (e não método) porque recebe o PoolClient da transação de quem chama.
 */
export async function inserirAlerta(executor: Queryable, a: NovoAlerta): Promise<Alerta> {
  const { rows } = await executor.query<AlertaRow>(
    `insert into alertas (client_id, asset_id, evento_id, origem, tipo, titulo, detalhe, prioridade, ts)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, client_id, asset_id, origem, tipo, titulo, detalhe, prioridade, ts, lido_em, tratado_em,
       null::text as tratado_por_email, tratamento_motivo, tratamento_obs`,
    [a.clientId, a.assetId, a.eventoId, a.origem, a.tipo, a.titulo, a.detalhe, a.prioridade, a.ts],
  );
  return toAlerta(rows[0]);
}

/** `client_id` é sempre o primeiro filtro, como no BaseRepository. */
@Injectable()
export class AlertasRepository extends BaseRepository<AlertaRow> {
  protected readonly table = 'alertas';

  /** Abertos (sem tratamento) de qualquer data + todos desde `desde`, mais recentes primeiro. */
  async listar(clientId: string, desde: Date, limite = 500): Promise<Alerta[]> {
    const { rows } = await this.pool.query<AlertaRow>(
      `${SELECT} where a.client_id = $1 and (a.tratado_em is null or a.ts >= $2) order by a.ts desc limit $3`,
      [clientId, desde, limite],
    );
    return rows.map(toAlerta);
  }

  async buscar(clientId: string, id: string, executor: Queryable = this.pool): Promise<Alerta | null> {
    const { rows } = await executor.query<AlertaRow>(`${SELECT} where a.client_id = $1 and a.id = $2`, [clientId, id]);
    return rows[0] ? toAlerta(rows[0]) : null;
  }

  /** Sem `ids`: todos os não lidos do cliente. Devolve os que mudaram (para avisar os outros usuários). */
  async marcarLidos(clientId: string, ids: string[] | null): Promise<Alerta[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `update alertas set lido_em = now()
       where client_id = $1 and lido_em is null and ($2::uuid[] is null or id = any($2::uuid[]))
       returning id`,
      [clientId, ids],
    );
    if (rows.length === 0) return [];
    const { rows: atualizados } = await this.pool.query<AlertaRow>(`${SELECT} where a.client_id = $1 and a.id = any($2::uuid[])`, [
      clientId,
      rows.map((r) => r.id),
    ]);
    return atualizados.map(toAlerta);
  }

  /** `null` se não existe para este cliente; `false` se já estava tratado (não sobrescreve quem tratou). */
  async tratar(
    clientId: string,
    id: string,
    userId: string,
    motivo: string,
    obs: string | null,
    executor: Queryable = this.pool,
  ): Promise<'tratado' | 'ja_tratado' | null> {
    const { rowCount } = await executor.query(
      `update alertas set tratado_em = now(), tratado_por = $3, tratamento_motivo = $4, tratamento_obs = $5,
         lido_em = coalesce(lido_em, now())
       where client_id = $1 and id = $2 and tratado_em is null`,
      [clientId, id, userId, motivo, obs],
    );
    if ((rowCount ?? 0) > 0) return 'tratado';
    return (await this.buscar(clientId, id, executor)) ? 'ja_tratado' : null;
  }
}
