import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { ClientEntity, ClientResumo } from './client.entity';

/**
 * `clients` é a própria âncora de `client_id` (docs/ARQUITETURA-BACKEND.md § 2.1) — não há um
 * `client_id` externo para filtrar por aqui, então este repositório não estende `BaseRepository`
 * (que existe para impor esse filtro nas tabelas de negócio escopadas por cliente). Quem acessa esta
 * tabela é só a camada administrativa (Locale/revenda), nunca o gestor de frota.
 */
@Injectable()
export class ClientsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<ClientEntity[]> {
    const { rows } = await this.pool.query<ClientEntity>('select * from clients order by name');
    return rows;
  }

  /**
   * Lista do Painel da Locale: cada cliente com o tamanho da conta. Contagem agregada entre clientes é
   * legítima só aqui — a rota que usa isto (`GET /clients`) é exclusiva de superadmin.
   */
  async findAllResumo(): Promise<ClientResumo[]> {
    const { rows } = await this.pool.query<ClientResumo>(
      `select c.*,
         (select count(*)::int from users u where u.client_id = c.id and u.desativado_em is null and u.password_hash is not null) as usuarios_ativos,
         (select count(*)::int from users u where u.client_id = c.id and u.desativado_em is null and u.password_hash is null) as convites_pendentes,
         (select u.id from users u where u.client_id = c.id and u.desativado_em is null and u.password_hash is null and u.role = 'admin'
           order by u.created_at limit 1) as admin_pendente_id,
         (select k.status from contratos k where k.client_id = c.id) as contrato_status,
         (select count(*)::int from assets a where a.client_id = c.id) as veiculos,
         (select count(*)::int from instalacoes i where i.client_id = c.id and i.desinstalado_em is null) as rastreadores_instalados
       from clients c
       order by c.name`,
    );
    return rows;
  }

  async findById(id: string): Promise<ClientEntity | null> {
    const { rows } = await this.pool.query<ClientEntity>('select * from clients where id = $1', [id]);
    return rows[0] ?? null;
  }

  async create(
    data: { name: string; revendaId?: string | null },
    executor: Queryable = this.pool,
  ): Promise<ClientEntity> {
    const { rows } = await executor.query<ClientEntity>(
      'insert into clients (name, revenda_id) values ($1, $2) returning *',
      [data.name, data.revendaId ?? null],
    );
    return rows[0];
  }

  async rename(id: string, name: string): Promise<ClientEntity | null> {
    const { rows } = await this.pool.query<ClientEntity>(
      'update clients set name = $1, updated_at = now() where id = $2 returning *',
      [name, id],
    );
    return rows[0] ?? null;
  }
}
