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

  /** Transação curta (um único statement): reivindica e já libera o lock antes de processar. */
  async reivindicar(workerId: string, limite: number, leaseSegundos = 120): Promise<InboxRow[]> {
    const { rows } = await this.pool.query<InboxRow>(
      `with lote as (
         select id from ingest_inbox
         where processado_em is null and tentativas < $4
           and (lease_expira_em is null or lease_expira_em < now())
         order by id for update skip locked limit $2
       )
       update ingest_inbox i set lease_por = $1, lease_expira_em = now() + make_interval(secs => $3),
         tentativas = i.tentativas + 1
       from lote where i.id = lote.id
       returning i.id, i.tipo, i.payload, i.tentativas`,
      [workerId, limite, leaseSegundos, INBOX_MAX_TENTATIVAS],
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

  async limparProcessados(dias = 3): Promise<number> {
    const { rowCount } = await this.pool.query(
      `delete from ingest_inbox where processado_em is not null and processado_em < now() - make_interval(days => $1)`,
      [dias],
    );
    return rowCount ?? 0;
  }
}
