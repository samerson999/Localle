import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { AparelhoTraccar } from './lista-traccar';

export interface TraccarAparelhoRow extends AparelhoTraccar {
  id: number;
  atualizado_em: Date;
}

/** `%` e `_` digitados são literais na busca, não curingas. */
export const termoLike = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Lista global de aparelhos do Traccar (migration 1793170000000): sem `client_id`, só a camada de superadmin acessa. */
@Injectable()
export class TraccarAparelhosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async resumo(): Promise<{ total: number; atualizado_em: Date | null }> {
    const { rows } = await this.pool.query('select count(*)::int as total, max(atualizado_em) as atualizado_em from traccar_aparelhos');
    return rows[0];
  }

  async findById(id: number): Promise<TraccarAparelhoRow | null> {
    const { rows } = await this.pool.query<TraccarAparelhoRow>('select * from traccar_aparelhos where id = $1', [id]);
    return rows[0] ?? null;
  }

  /** Por nome ou protocolo; nome que começa com o termo vem primeiro. */
  async buscar(q: string, limite: number): Promise<TraccarAparelhoRow[]> {
    const { rows } = await this.pool.query<TraccarAparelhoRow>(
      `select * from traccar_aparelhos
        where nome ilike $1 or protocolo ilike $1
        order by (nome ilike $2) desc, lower(nome) limit $3`,
      [termoLike(q), `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, limite],
    );
    return rows;
  }

  /**
   * Troca a lista inteira pela nova num comando só (atômico sem depender de transação): atualiza o que já existe (o id
   * fica estável), insere o novo e apaga o que saiu da página. A lista não pode ter nome+protocolo repetido
   * (`lerListaTraccar` já tira).
   */
  async substituir(lista: AparelhoTraccar[], executor: Queryable = this.pool): Promise<{ total: number; removidos: number }> {
    const { rows } = await executor.query<{ removidos: number }>(
      `with gravados as (
         insert into traccar_aparelhos (nome, protocolo, porta)
         select * from unnest($1::text[], $2::text[], $3::int[])
         on conflict (lower(nome), protocolo) do update set nome = excluded.nome, porta = excluded.porta, atualizado_em = now()
         returning id
       ), removidos as (
         delete from traccar_aparelhos where id not in (select id from gravados) returning 1
       )
       select count(*)::int as removidos from removidos`,
      [lista.map((a) => a.nome), lista.map((a) => a.protocolo), lista.map((a) => a.porta)],
    );
    return { total: lista.length, removidos: rows[0].removidos };
  }
}
