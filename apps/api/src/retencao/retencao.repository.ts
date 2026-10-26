import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export interface PrazoCliente {
  clientId: string;
  /** `contrato_versoes.historico_meses` da versão mais recente do contrato. */
  historicoMeses: number;
}

/**
 * Não estende `BaseRepository`: a rotina é de plataforma (percorre todos os clientes), e cada delete
 * leva `client_id` explícito no `where` — nunca apaga por período sem cliente.
 */
@Injectable()
export class RetencaoRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Um prazo por cliente com contrato (qualquer status: cancelado/suspenso continuam com o histórico contratado). */
  async prazosPorCliente(): Promise<PrazoCliente[]> {
    const { rows } = await this.pool.query<{ client_id: string; historico_meses: number }>(
      `select distinct on (c.client_id) c.client_id, v.historico_meses
       from contratos c join contrato_versoes v on v.contrato_id = c.id
       order by c.client_id, v.criado_em desc`,
    );
    return rows.map((r) => ({ clientId: r.client_id, historicoMeses: r.historico_meses }));
  }

  async clientesSemContrato(): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      'select count(*)::int as n from clients cl where not exists (select 1 from contratos c where c.client_id = cl.id)',
    );
    return rows[0].n;
  }

  /** Apaga em lotes (hypertable comprimida: delete grande numa transação só segura lock por muito tempo). */
  async apagarPosicoes(clientId: string, antesDe: Date, lote = 10_000): Promise<number> {
    return this.apagarEmLotes(
      `delete from posicoes where (rastreador_id, fix_time, id) in (
         select rastreador_id, fix_time, id from posicoes where client_id = $1 and fix_time < $2 limit $3)`,
      [clientId, antesDe, lote],
      lote,
    );
  }

  async apagarEventos(clientId: string, antesDe: Date, lote = 10_000): Promise<number> {
    return this.apagarEmLotes(
      `delete from eventos where id in (select id from eventos where client_id = $1 and ts < $2 limit $3)`,
      [clientId, antesDe, lote],
      lote,
    );
  }

  /** Posição sem dono (rastreador sem instalação vigente no instante do dado): prazo fixo da plataforma. */
  async apagarPosicoesSemCliente(antesDe: Date, lote = 10_000): Promise<number> {
    return this.apagarEmLotes(
      `delete from posicoes where (rastreador_id, fix_time, id) in (
         select rastreador_id, fix_time, id from posicoes where client_id is null and fix_time < $1 limit $2)`,
      [antesDe, lote],
      lote,
    );
  }

  private async apagarEmLotes(sql: string, params: unknown[], lote: number): Promise<number> {
    let total = 0;
    for (;;) {
      const { rowCount } = await this.pool.query(sql, params);
      total += rowCount ?? 0;
      if ((rowCount ?? 0) < lote) return total;
    }
  }
}
