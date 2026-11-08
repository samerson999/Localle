import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export interface Empresa {
  razaoSocial: string | null;
  cnpj: string | null;
  endereco: string | null;
}

/**
 * Dados do empregador do próprio cliente (`clients.empresa`). Não usa BaseRepository porque `clients` é o
 * próprio tenant (não tem `client_id`): o isolamento é o `where id = $1` com o `client_id` do JWT.
 */
@Injectable()
export class EmpresaRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async buscar(clientId: string): Promise<Empresa | null> {
    const { rows } = await this.pool.query<{ empresa: Partial<Empresa> }>('select empresa from clients where id = $1', [clientId]);
    if (!rows[0]) return null;
    const e = rows[0].empresa || {};
    return { razaoSocial: e.razaoSocial ?? null, cnpj: e.cnpj ?? null, endereco: e.endereco ?? null };
  }

  async salvar(clientId: string, e: Empresa): Promise<Empresa | null> {
    const { rowCount } = await this.pool.query('update clients set empresa = $2 where id = $1', [clientId, JSON.stringify(e)]);
    return rowCount ? e : null;
  }
}
