import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';
import { withTransaction } from '../db/with-transaction';

export interface GrupoRow {
  id: string;
  client_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface Grupo {
  id: string;
  name: string;
  assetIds: string[];
}

/** Grupos de ativos do cliente (docs/PLANO-SETUP-ADMIN.md § 8, decisão 1). Um ativo pode estar em vários grupos. */
@Injectable()
export class GruposRepository extends BaseRepository<GrupoRow> {
  protected readonly table = 'asset_groups';

  async listar(clientId: string): Promise<Grupo[]> {
    const { rows } = await this.pool.query<{ id: string; name: string; asset_ids: string[] | null }>(
      `select g.id, g.name,
         (select array_agg(m.asset_id order by m.asset_id) from asset_group_members m where m.group_id = g.id) as asset_ids
       from asset_groups g where g.client_id = $1 order by g.name`,
      [clientId],
    );
    return rows.map((r) => ({ id: r.id, name: r.name, assetIds: r.asset_ids ?? [] }));
  }

  async buscar(clientId: string, id: string): Promise<Grupo | null> {
    return (await this.listar(clientId)).find((g) => g.id === id) ?? null;
  }

  async criar(clientId: string, name: string): Promise<Grupo> {
    const row = await this.insert(clientId, { name });
    return { id: row.id, name: row.name, assetIds: [] };
  }

  async renomear(clientId: string, id: string, name: string): Promise<Grupo | null> {
    const row = await this.update(clientId, id, { name, updated_at: new Date() });
    return row ? this.buscar(clientId, id) : null;
  }

  /**
   * Substitui a lista de ativos do grupo. `insert ... select` com `client_id` nas duas pontas: ativo de outro
   * cliente simplesmente não entra (sem IDOR por `assetId`); devolve `null` se o grupo não é do cliente.
   */
  async definirAtivos(clientId: string, id: string, assetIds: string[]): Promise<Grupo | null> {
    return withTransaction(this.pool, async (tx) => {
      const g = await tx.query('select 1 from asset_groups where client_id = $1 and id = $2', [clientId, id]);
      if (g.rowCount === 0) return null;
      await tx.query('delete from asset_group_members where client_id = $1 and group_id = $2', [clientId, id]);
      if (assetIds.length > 0) {
        await tx.query(
          `insert into asset_group_members (client_id, group_id, asset_id)
           select $1, $2, a.id from assets a where a.client_id = $1 and a.id = any($3::uuid[])`,
          [clientId, id, assetIds],
        );
      }
      const { rows } = await tx.query<{ asset_id: string }>('select asset_id from asset_group_members where group_id = $1 order by asset_id', [id]);
      const { rows: nome } = await tx.query<{ name: string }>('select name from asset_groups where id = $1', [id]);
      return { id, name: nome[0].name, assetIds: rows.map((r) => r.asset_id) };
    });
  }

  /** Grupos de um ativo (para resolver o override de grupo de um parâmetro `porGrupo`). */
  async gruposDoAtivo(clientId: string, assetId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ group_id: string }>('select group_id from asset_group_members where client_id = $1 and asset_id = $2', [clientId, assetId]);
    return rows.map((r) => r.group_id);
  }
}
