import { Injectable } from '@nestjs/common';
import type { Alerta } from '@localle/shared/realtime';
import { BaseRepository } from '../db/base.repository';
import type { Queryable } from '../db/queryable';
import { enfileirarNotificacao } from '../notificacoes/notificacao-fila.repository';

interface AlertaRow {
  id: string;
  client_id: string;
  asset_id: string | null;
  origem: Alerta['origem'];
  tipo: string;
  titulo: string;
  detalhe: string | null;
  prioridade: Alerta['prioridade'];
  exige_tratamento: boolean;
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
  /** Regra do cliente decide no formulário dela; sem isso vale o catálogo `alerta_tipos` e, fora dele, a prioridade. */
  exigeTratamento?: boolean;
}

/** Colunas de `alertas` na ordem do `AlertaRow` (sem o e-mail de quem tratou, que vem de `users`). */
export const COLUNAS_ALERTA = `id, client_id, asset_id, origem, tipo, titulo, detalhe, prioridade, exige_tratamento, ts, lido_em, tratado_em,
  tratamento_motivo, tratamento_obs`;

/** Se o alerta exige tratamento quando quem cria não decide: catálogo da plataforma e, fora dele, prioridade alta. */
export const EXIGE_TRATAMENTO_PADRAO = (tipo: string, prioridade: string) =>
  `coalesce((select t.exige_tratamento from alerta_tipos t where t.chave = ${tipo}), ${prioridade} = 'alta')`;

const SELECT = `
  select a.id, a.client_id, a.asset_id, a.origem, a.tipo, a.titulo, a.detalhe, a.prioridade, a.exige_tratamento, a.ts,
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
    exigeTratamento: r.exige_tratamento,
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
export async function inserirAlerta(executor: Queryable, a: NovoAlerta): Promise<Alerta | null> {
  // alerta da plataforma que o cliente desligou no Setup dele: não nasce (o evento continua gravado por quem chamou)
  const { rows: tipo } = await executor.query<{ ligado: boolean | null; notifica_push: boolean | null }>(
    `select (select c.ligado from alerta_tipos_cliente c where c.client_id = $1 and c.chave = $2) as ligado,
            (select t.notifica_push from alerta_tipos t where t.chave = $2) as notifica_push`,
    [a.clientId, a.tipo],
  );
  if (tipo[0]?.ligado === false) return null;
  const { rows } = await executor.query<AlertaRow>(
    `insert into alertas (client_id, asset_id, evento_id, origem, tipo, titulo, detalhe, prioridade, ts, exige_tratamento)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::boolean, ${EXIGE_TRATAMENTO_PADRAO('$5', '$8')}))
     returning ${COLUNAS_ALERTA}, null::text as tratado_por_email`,
    [a.clientId, a.assetId, a.eventoId, a.origem, a.tipo, a.titulo, a.detalhe, a.prioridade, a.ts, a.exigeTratamento ?? null],
  );
  const alerta = toAlerta(rows[0]);
  // mesma transação do alerta (docs/PLANO-APK-TWA.md § 2): push nunca atrasa nem derruba a gravação do alerta.
  // Tipo do catálogo com "notificar no celular" desligado não vai para a fila; regra e cerca seguem a preferência.
  if (tipo[0]?.notifica_push !== false) await enfileirarNotificacao(executor, a.clientId, alerta.id);
  return alerta;
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

  /**
   * Encerra a ocorrência. `null` se não existe para este cliente; `ja_tratado` não sobrescreve quem encerrou;
   * `aviso` = o alerta não exige tratamento (sai com "lido", não com desfecho).
   */
  async tratar(
    clientId: string,
    id: string,
    userId: string,
    motivo: string,
    obs: string | null,
    executor: Queryable = this.pool,
  ): Promise<'tratado' | 'ja_tratado' | 'aviso' | null> {
    const { rowCount } = await executor.query(
      `update alertas set tratado_em = now(), tratado_por = $3, tratamento_motivo = $4, tratamento_obs = $5,
         lido_em = coalesce(lido_em, now())
       where client_id = $1 and id = $2 and exige_tratamento and tratado_em is null`,
      [clientId, id, userId, motivo, obs],
    );
    if ((rowCount ?? 0) > 0) return 'tratado';
    const atual = await this.buscar(clientId, id, executor);
    if (!atual) return null;
    return atual.exigeTratamento ? 'ja_tratado' : 'aviso';
  }
}
