import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';

export interface FilaRow {
  id: string;
  client_id: string;
  alerta_id: string;
  tentativas: number;
}

export const NOTIFICACAO_FILA_MAX_TENTATIVAS = 8;

/**
 * Chamada de dentro da MESMA transação que grava o alerta (alertas.repository.ts / inserirAlerta):
 * push lento ou fora do ar nunca atrasa nem derruba a gravação do alerta. `on conflict do nothing`:
 * `alerta_id` é único, então reentrega do mesmo alerta (não deveria acontecer, mas não quebra).
 */
export async function enfileirarNotificacao(executor: Queryable, clientId: string, alertaId: string): Promise<void> {
  await executor.query(
    `insert into notificacao_fila (client_id, alerta_id) values ($1, $2) on conflict (alerta_id) do nothing`,
    [clientId, alertaId],
  );
}

/**
 * Alerta que subiu de nível (sem_posicao) notifica de novo: a linha do mesmo `alerta_id` volta para a fila,
 * zerada. Se ainda não tinha sido entregue, só segue pendente — o push sai uma vez, já com o nível novo.
 */
export async function reenfileirarNotificacao(executor: Queryable, clientId: string, alertaId: string): Promise<void> {
  await executor.query(
    `insert into notificacao_fila (client_id, alerta_id) values ($1, $2)
     on conflict (alerta_id) do update
       set processado_em = null, tentativas = 0, erro = null, lease_por = null, lease_expira_em = null`,
    [clientId, alertaId],
  );
}

/**
 * `notificacao_fila` não é acessada por rota de cliente (só o worker interno) — por isso não estende
 * `BaseRepository`; protocolo de lease igual ao `InboxRepository` (ingest/inbox.repository.ts).
 */
@Injectable()
export class NotificacaoFilaRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async reivindicar(workerId: string, limite: number, leaseSegundos = 60): Promise<FilaRow[]> {
    const { rows } = await this.pool.query<FilaRow>(
      `update notificacao_fila set lease_por = $1, lease_expira_em = now() + make_interval(secs => $3), tentativas = tentativas + 1
       where id in (
         select id from notificacao_fila
         where processado_em is null and tentativas < $4 and (lease_expira_em is null or lease_expira_em < now())
         order by id for update skip locked limit $2
       )
       returning id, client_id, alerta_id, tentativas`,
      [workerId, limite, leaseSegundos, NOTIFICACAO_FILA_MAX_TENTATIVAS],
    );
    return rows;
  }

  async concluir(id: string): Promise<void> {
    await this.pool.query(
      `update notificacao_fila set processado_em = now(), erro = null, lease_por = null, lease_expira_em = null where id = $1`,
      [id],
    );
  }

  /** Mesmo backoff crescente do inbox: 30s × tentativas, senão um erro persistente esgotaria as tentativas em segundos. */
  async falhar(id: string, erro: string): Promise<void> {
    await this.pool.query(
      `update notificacao_fila set erro = $2, lease_expira_em = now() + make_interval(secs => 30 * tentativas) where id = $1`,
      [id, erro.slice(0, 1000)],
    );
  }

  async devolver(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.pool.query(
      `update notificacao_fila set lease_por = null, lease_expira_em = null, tentativas = greatest(tentativas - 1, 0)
       where id = any($1) and processado_em is null`,
      [ids],
    );
  }

  async limparProcessados(dias = 3): Promise<number> {
    const { rowCount } = await this.pool.query(
      `delete from notificacao_fila where processado_em is not null and processado_em < now() - make_interval(days => $1)`,
      [dias],
    );
    return rowCount ?? 0;
  }
}
