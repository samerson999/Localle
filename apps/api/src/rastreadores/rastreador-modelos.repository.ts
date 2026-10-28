import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { RastreadorModeloEntity } from './rastreador-modelo.entity';

export type ModeloDados = Pick<RastreadorModeloEntity, 'fabricante' | 'nome' | 'protocolo' | 'porta' | 'tipo_identificador'>;

/**
 * Catálogo global de modelos (sem `client_id`, como `rastreadores`): não estende `BaseRepository` pelo mesmo motivo
 * de `RastreadoresRepository`. Só a camada de superadmin acessa.
 */
@Injectable()
export class RastreadorModelosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listar(): Promise<(RastreadorModeloEntity & { rastreadores: number })[]> {
    const { rows } = await this.pool.query(
      `select m.*, (select count(*)::int from rastreadores r where r.modelo_id = m.id and r.status <> 'desativado') as rastreadores
         from rastreador_modelos m
        order by m.ativo desc, lower(m.fabricante), lower(m.nome)`,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.pool): Promise<RastreadorModeloEntity | null> {
    const { rows } = await executor.query<RastreadorModeloEntity>('select * from rastreador_modelos where id = $1', [id]);
    return rows[0] ?? null;
  }

  async criar(d: ModeloDados, executor: Queryable = this.pool): Promise<RastreadorModeloEntity> {
    const { rows } = await executor.query<RastreadorModeloEntity>(
      `insert into rastreador_modelos (fabricante, nome, protocolo, porta, tipo_identificador)
       values ($1, $2, $3, $4, $5) returning *`,
      [d.fabricante, d.nome, d.protocolo, d.porta, d.tipo_identificador],
    );
    return rows[0];
  }

  async atualizar(id: string, d: Partial<ModeloDados & { ativo: boolean }>, executor: Queryable = this.pool): Promise<RastreadorModeloEntity | null> {
    const campos = (['fabricante', 'nome', 'protocolo', 'porta', 'tipo_identificador', 'ativo'] as const).filter((k) => d[k] !== undefined);
    if (!campos.length) return this.findById(id, executor);
    // nomes de coluna vêm da lista fixa acima, nunca do corpo da requisição
    const sets = campos.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await executor.query<RastreadorModeloEntity>(
      `update rastreador_modelos set ${sets}, atualizado_em = now() where id = $1 returning *`,
      [id, ...campos.map((k) => d[k])],
    );
    return rows[0] ?? null;
  }
}
