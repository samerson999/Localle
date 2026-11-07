import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { INBOX_MAX_TENTATIVAS } from './inbox.repository';
import type { TraccarPositionPayload } from './traccar-position.mapper';

export interface RastreadorConciliavel {
  rastreadorId: string;
  traccarDeviceId: number;
  /** null = nunca conferido (sem checkpoint ainda). */
  conciliadoAte: Date | null;
}

export interface ContagemJanela {
  verificadas: number;
  jaRecebidas: number;
  jaNoInbox: number;
  recuperadas: number;
}

class CheckpointMudou extends Error {}

export type ModoConciliacao = 'automatica' | 'manual';

export interface TotaisExecucao extends ContagemJanela {
  rastreadores: number;
  consultasTraccar: number;
  rejeitadas: number;
  falhas: number;
}

/**
 * Persistência da conciliação com o Traccar (migration 1793200000000). Tabelas de plataforma, sem `client_id` (o
 * rastreador ainda não foi resolvido para um cliente, igual ao `ingest_inbox`) — só a ingestão interna e a rota de
 * superadmin acessam; por isso não estende `BaseRepository`.
 */
@Injectable()
export class ConciliacaoRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async rastreadores(filtro?: { rastreadorId?: string; traccarDeviceId?: number }): Promise<RastreadorConciliavel[]> {
    const { rows } = await this.pool.query<{ id: string; traccar_device_id: string; conciliado_ate: Date | null }>(
      `select r.id, r.traccar_device_id, c.conciliado_ate
         from rastreadores r left join ingest_conciliacao_checkpoints c on c.rastreador_id = r.id
        where r.traccar_device_id is not null
          and ($1::uuid is null or r.id = $1) and ($2::bigint is null or r.traccar_device_id = $2)
        order by c.conciliado_ate nulls first, r.id`,
      [filtro?.rastreadorId ?? null, filtro?.traccarDeviceId ?? null],
    );
    return rows.map((r) => ({ rastreadorId: r.id, traccarDeviceId: Number(r.traccar_device_id), conciliadoAte: r.conciliado_ate }));
  }

  /**
   * Uma janela de um rastreador, numa transação: descobre quais posições do Traccar ainda não estão gravadas
   * (`ingest_posicoes_recebidas`) nem esperando no inbox, insere as que faltam com prioridade 1 e — se `checkpoint`
   * vier — avança o checkpoint no mesmo commit. O avanço é condicional ao valor lido (`esperado`): se outra instância
   * da API conciliou o mesmo rastreador no meio, nada é gravado (`conflito`) e a próxima volta recomeça do valor novo.
   */
  async gravarJanela(
    r: { rastreadorId: string; traccarDeviceId: number },
    posicoes: TraccarPositionPayload[],
    checkpoint: { esperado: Date | null; novo: Date } | null,
  ): Promise<ContagemJanela & { conflito: boolean }> {
    try {
      return await withTransaction(this.pool, (client) => this.janelaNaTransacao(client, r, posicoes, checkpoint));
    } catch (err) {
      if (err instanceof CheckpointMudou) return { verificadas: posicoes.length, jaRecebidas: 0, jaNoInbox: 0, recuperadas: 0, conflito: true };
      throw err;
    }
  }

  private async janelaNaTransacao(
    client: PoolClient,
    r: { rastreadorId: string; traccarDeviceId: number },
    posicoes: TraccarPositionPayload[],
    checkpoint: { esperado: Date | null; novo: Date } | null,
  ): Promise<ContagemJanela & { conflito: boolean }> {
    const ids = posicoes.map((p) => p.id);
    // Ordem importa (corrida vista em 06/11/2026): o worker grava em ingest_posicoes_recebidas e SÓ DEPOIS marca a linha do
    // inbox como processada. Consultando o inbox primeiro, uma posição ou ainda aparece pendente, ou já está gravada quando
    // a segunda consulta roda. Na ordem inversa, uma gravação concluída entre as duas consultas sumia das duas e a posição
    // era reinserida no inbox (o dedup impedia a duplicata em posicoes, mas a linha extra era trabalho à toa).
    // mesma expressão do índice ingest_inbox_posicao_pendente_idx
    const pendentes = ids.length
      ? (
          await client.query<{ id: string }>(
            `select (payload->'position'->>'id')::bigint as id from ingest_inbox
              where processado_em is null and tipo = 'posicao'
                and (payload->'position'->>'deviceId')::bigint = $1
                and (payload->'position'->>'id')::bigint = any($2::bigint[])`,
            [r.traccarDeviceId, ids],
          )
        ).rows.map((x) => Number(x.id))
      : [];
    const recebidas = ids.length
      ? (
          await client.query<{ id: string }>(
            `select traccar_position_id as id from ingest_posicoes_recebidas
              where rastreador_id = $1 and traccar_position_id = any($2::bigint[])`,
            [r.rastreadorId, ids],
          )
        ).rows.map((x) => Number(x.id))
      : [];
    const conhecidas = new Set([...recebidas, ...pendentes]);
    const faltando = posicoes.filter((p) => !conhecidas.has(p.id));

    if (faltando.length) {
      await client.query(
        `insert into ingest_inbox (tipo, payload, prioridade)
         select 'posicao', jsonb_build_object('position', p, 'origem', 'conciliacao'), 1
           from jsonb_array_elements($1::jsonb) p`,
        [JSON.stringify(faltando)],
      );
    }

    if (checkpoint) {
      const { rowCount } = await client.query(
        `insert into ingest_conciliacao_checkpoints as c (rastreador_id, conciliado_ate) values ($1, $2)
         on conflict (rastreador_id) do update set conciliado_ate = excluded.conciliado_ate, atualizado_em = now()
         where c.conciliado_ate is not distinct from $3::timestamptz`,
        [r.rastreadorId, checkpoint.novo, checkpoint.esperado],
      );
      if (!rowCount) throw new CheckpointMudou(); // desfaz também as inserções no inbox
    }
    // uma posição sendo gravada agora está nas duas listas (gravada, linha do inbox ainda não concluída): conta uma vez
    const gravadas = new Set(recebidas);
    return {
      verificadas: posicoes.length,
      jaRecebidas: gravadas.size,
      jaNoInbox: pendentes.filter((id) => !gravadas.has(id)).length,
      recuperadas: faltando.length,
      conflito: false,
    };
  }

  /** Recuperadas ainda não processadas: base do freio (não enfileirar mais do que o consumidor dá conta). */
  async pendentesRecuperadas(): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      `select count(*) as n from ingest_inbox where processado_em is null and prioridade = 1 and tentativas < $1`,
      [INBOX_MAX_TENTATIVAS],
    );
    return Number(rows[0].n);
  }

  async iniciarExecucao(modo: ModoConciliacao, parametros: Record<string, unknown>): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      'insert into ingest_conciliacao_execucoes (modo, parametros) values ($1, $2) returning id',
      [modo, parametros],
    );
    return rows[0].id;
  }

  async concluirExecucao(id: string, t: TotaisExecucao, interrompidaPor: string | null): Promise<void> {
    await this.pool.query(
      `update ingest_conciliacao_execucoes set concluida_em = now(), rastreadores = $2, consultas_traccar = $3,
         verificadas = $4, ja_recebidas = $5, ja_no_inbox = $6, recuperadas = $7, rejeitadas = $8, falhas = $9,
         interrompida_por = $10
       where id = $1`,
      [id, t.rastreadores, t.consultasTraccar, t.verificadas, t.jaRecebidas, t.jaNoInbox, t.recuperadas, t.rejeitadas, t.falhas, interrompidaPor],
    );
  }

  /** Situação para a rota de superadmin: últimas voltas, fila de recuperadas e rastreadores mais atrasados. */
  async situacao() {
    const [execucoes, inbox, checkpoints] = await Promise.all([
      this.pool.query(
        `select id, modo, iniciada_em, concluida_em, parametros, rastreadores, consultas_traccar, verificadas, ja_recebidas,
                ja_no_inbox, recuperadas, rejeitadas, falhas, interrompida_por
           from ingest_conciliacao_execucoes order by iniciada_em desc limit 20`,
      ),
      this.pool.query<{ pendentes: number; falhas: number; processadas_24h: number }>(
        `select count(*) filter (where processado_em is null and tentativas < $1)::int as pendentes,
                count(*) filter (where processado_em is null and tentativas >= $1)::int as falhas,
                count(*) filter (where processado_em > now() - interval '24 hours')::int as processadas_24h
           from ingest_inbox where prioridade = 1`,
        [INBOX_MAX_TENTATIVAS],
      ),
      this.pool.query(
        `select r.id as rastreador_id, r.traccar_device_id, c.conciliado_ate
           from rastreadores r left join ingest_conciliacao_checkpoints c on c.rastreador_id = r.id
          where r.traccar_device_id is not null
          order by c.conciliado_ate nulls first limit 10`,
      ),
    ]);
    return { execucoes: execucoes.rows, recuperadasNoInbox: inbox.rows[0], maisAtrasados: checkpoints.rows };
  }
}
