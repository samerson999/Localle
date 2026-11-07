import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export type InboxTipo = 'posicao' | 'evento';

export interface InboxRow {
  id: string;
  tipo: InboxTipo;
  payload: unknown;
  tentativas: number;
}

export const INBOX_MAX_TENTATIVAS = 10;

/** Faixa de processamento paralelo (inbox.worker.ts): `indice` de 0 a `total` − 1. */
export interface Faixa {
  indice: number;
  total: number;
}

/**
 * Cada aparelho cai sempre na mesma faixa (hash do deviceId do Traccar, de posição ou de evento): dentro de um processo,
 * as linhas de um rastreador continuam em ordem, e faixas diferentes gravam rastreadores diferentes em paralelo.
 * `& 2147483647` em vez de abs(): abs(hashtext) estoura no menor inteiro. Sem faixa ($6 nulo), filtro nenhum.
 */
const FILTRO_FAIXA = `($6::int is null or (hashtext(coalesce(payload->'position'->>'deviceId', payload->'event'->>'deviceId', '')) & 2147483647) % $6::int = $7::int)`;

/**
 * Por quantos dias o controle de duplicidade (`ingest_posicoes_recebidas`/`ingest_eventos_recebidos`) é mantido
 * (`INGEST_DEDUP_DIAS`, padrão 14). Depois disso a mesma posição chegando de novo seria gravada outra vez — por isso a
 * conciliação nunca confere período mais antigo que isto.
 */
export function diasControleDuplicidade(): number {
  const v = Number(process.env.INGEST_DEDUP_DIAS);
  return Number.isFinite(v) && v >= 2 ? v : 14;
}

/**
 * `ingest_inbox` não tem `client_id` (o payload do Traccar ainda não foi resolvido para um cliente) — só
 * a ingestão interna acessa, nunca uma rota de cliente; por isso não estende `BaseRepository`.
 * Protocolo de lease: docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.1.
 */
@Injectable()
export class InboxRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async inserir(tipo: InboxTipo, payload: unknown): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      'insert into ingest_inbox (tipo, payload) values ($1, $2) returning id',
      [tipo, payload],
    );
    return rows[0].id;
  }

  /**
   * Transação curta (um único statement): reivindica e já libera o lock antes de processar. Tempo real (prioridade 0)
   * vem primeiro; as recuperadas pela conciliação (prioridade 1) preenchem o resto do lote e têm sempre `reservaRecuperadas`
   * vagas — um backlog de recuperação não atrasa o mapa, e um fluxo de tempo real cheio não trava a recuperação.
   */
  async reivindicar(
    workerId: string,
    limite: number,
    leaseSegundos = 120,
    reservaRecuperadas = 10,
    faixa: Faixa | null = null,
  ): Promise<InboxRow[]> {
    const { rows } = await this.pool.query<InboxRow>(
      `with tempo_real as (
         select id from ingest_inbox
         where processado_em is null and tentativas < $4 and prioridade = 0
           and (lease_expira_em is null or lease_expira_em < now()) and ${FILTRO_FAIXA}
         order by id for update skip locked limit $2
       ), recuperadas as (
         select id from ingest_inbox
         where processado_em is null and tentativas < $4 and prioridade = 1
           and (lease_expira_em is null or lease_expira_em < now()) and ${FILTRO_FAIXA}
         order by id for update skip locked limit greatest($5, $2 - (select count(*) from tempo_real))
       ), lote as (select id from tempo_real union all select id from recuperadas)
       update ingest_inbox i set lease_por = $1, lease_expira_em = now() + make_interval(secs => $3),
         tentativas = i.tentativas + 1
       from lote where i.id = lote.id
       returning i.id, i.tipo, i.payload, i.tentativas`,
      [workerId, limite, leaseSegundos, INBOX_MAX_TENTATIVAS, reservaRecuperadas, faixa?.total ?? null, faixa?.indice ?? null],
    );
    return rows.sort((a, b) => Number(a.id) - Number(b.id));
  }

  async concluir(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.pool.query(
      'update ingest_inbox set processado_em = now(), erro = null, lease_por = null, lease_expira_em = null where id = any($1)',
      [ids],
    );
  }

  /** Recusada na admissão: não volta para a fila (formato não se conserta com retry); o motivo fica na linha. */
  async recusar(id: string, motivo: string): Promise<void> {
    await this.pool.query(
      `update ingest_inbox set processado_em = now(), erro = $2, lease_por = null, lease_expira_em = null where id = $1`,
      [id, `recusada: ${motivo}`.slice(0, 1000)],
    );
  }

  /** Desligamento: linhas reivindicadas que nem começaram voltam a ser elegíveis já, e a tentativa não conta. */
  async devolver(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.pool.query(
      `update ingest_inbox set lease_por = null, lease_expira_em = null, tentativas = greatest(tentativas - 1, 0)
       where id = any($1) and processado_em is null`,
      [ids],
    );
  }

  /**
   * Mantém `processado_em` nulo: volta a ser elegível quando o lease vencer, com espera crescente
   * (30 s × tentativas) — sem isso, um erro persistente esgotaria as tentativas em segundos.
   */
  async falhar(id: string, erro: string): Promise<void> {
    await this.pool.query(
      `update ingest_inbox set erro = $2, lease_expira_em = now() + make_interval(secs => 30 * tentativas) where id = $1`,
      [id, erro.slice(0, 1000)],
    );
  }

  /**
   * Apaga o controle de duplicidade mais velho que `dias`, em lotes (um delete grande seguraria lock e geraria WAL de uma
   * vez). `rastreador_comunicacao`, não esta tabela, é o que prova que um rastreador já transmitiu.
   */
  async limparControleDuplicidade(dias: number, lote = 5000): Promise<{ posicoes: number; eventos: number }> {
    const total = { posicoes: 0, eventos: 0 };
    for (const [tabela, chave] of [['ingest_posicoes_recebidas', 'posicoes'], ['ingest_eventos_recebidos', 'eventos']] as const) {
      for (;;) {
        const { rowCount } = await this.pool.query(
          `delete from ${tabela} where ctid = any(array(
             select ctid from ${tabela} where recebido_em < now() - make_interval(days => $1) limit $2))`,
          [dias, lote],
        );
        total[chave] += rowCount ?? 0;
        if ((rowCount ?? 0) < lote) break;
      }
    }
    return total;
  }

  /** Linhas que esgotaram as tentativas: ficam no inbox para análise manual e nunca mais são reivindicadas. */
  async esgotadas(): Promise<{ total: number; maisAntigaId: string | null; erro: string | null }> {
    const { rows } = await this.pool.query<{ total: number; id: string | null; erro: string | null }>(
      `select count(*)::int as total, min(id)::text as id,
              (select erro from ingest_inbox where processado_em is null and tentativas >= $1 order by id limit 1) as erro
         from ingest_inbox where processado_em is null and tentativas >= $1`,
      [INBOX_MAX_TENTATIVAS],
    );
    return { total: rows[0].total, maisAntigaId: rows[0].id, erro: rows[0].erro };
  }

  async limparProcessados(dias = 3): Promise<number> {
    const { rowCount } = await this.pool.query(
      `delete from ingest_inbox where processado_em is not null and processado_em < now() - make_interval(days => $1)`,
      [dias],
    );
    return rowCount ?? 0;
  }
}
