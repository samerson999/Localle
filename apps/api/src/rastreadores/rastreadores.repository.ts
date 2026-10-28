import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { RastreadorEntity, RastreadorPainel } from './rastreador.entity';

/**
 * `rastreadores` não tem `client_id` (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.1: o dono num dado
 * momento é o vínculo vigente em `rastreador_vinculos`, nunca fixo aqui) — por isso este repositório não estende
 * `BaseRepository`, mesmo raciocínio de `ClientsRepository`. Só a camada administrativa (superadmin)
 * acessa esta tabela diretamente.
 */
@Injectable()
export class RastreadoresRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<RastreadorEntity[]> {
    const { rows } = await this.pool.query<RastreadorEntity>(
      'select * from rastreadores order by criado_em desc',
    );
    return rows;
  }

  /**
   * Visão do inventário para o Painel da Locale: cada rastreador com o cliente do vínculo vigente, a
   * instalação vigente (placa), o chip vinculado e o último pacote recebido. Cruza clientes de propósito — rota só de superadmin.
   */
  async findAllPainel(): Promise<RastreadorPainel[]> {
    const { rows } = await this.pool.query<RastreadorPainel>(
      `select r.*,
              v.id as vinculo_id, v.client_id, c.name as client_name, v.vinculado_em,
              i.id as instalacao_id, i.asset_id, a.plate as asset_plate, i.instalado_em,
              s.id as sim_card_id, s.iccid, s.operadora,
              rc.ultimo_pacote_em,
              m.fabricante as modelo_fabricante, m.nome as modelo_nome, m.protocolo as modelo_protocolo, m.porta as modelo_porta,
              m.tipo_identificador as modelo_tipo_identificador,
              coalesce(r.protocolo is not null and m.protocolo is not null and r.protocolo <> m.protocolo, false) as protocolo_divergente
         from rastreadores r
         left join rastreador_modelos m on m.id = r.modelo_id
         left join rastreador_vinculos v on v.rastreador_id = r.id and v.desvinculado_em is null
         left join clients c on c.id = v.client_id
         left join instalacoes i on i.rastreador_id = r.id and i.desinstalado_em is null
         left join assets a on a.id = i.asset_id
         left join sim_cards s on s.rastreador_id = r.id
         left join rastreador_comunicacao rc on rc.rastreador_id = r.id
        order by r.criado_em desc`,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.pool): Promise<RastreadorEntity | null> {
    const { rows } = await executor.query<RastreadorEntity>(
      'select * from rastreadores where id = $1',
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    data: { imei: string; traccarDeviceId?: string | null; modelo?: string | null; modeloId?: string | null; protocolo?: string | null },
    executor: Queryable = this.pool,
  ): Promise<RastreadorEntity> {
    const { rows } = await executor.query<RastreadorEntity>(
      `insert into rastreadores (imei, traccar_device_id, modelo, modelo_id, protocolo)
       values ($1, $2, $3, $4, $5) returning *`,
      [data.imei, data.traccarDeviceId ?? null, data.modelo ?? null, data.modeloId ?? null, data.protocolo ?? null],
    );
    return rows[0];
  }

  async setTraccarDeviceId(id: string, traccarDeviceId: string, executor: Queryable = this.pool): Promise<RastreadorEntity> {
    const { rows } = await executor.query<RastreadorEntity>(
      `update rastreadores set traccar_device_id = $1, atualizado_em = now() where id = $2 returning *`,
      [traccarDeviceId, id],
    );
    return rows[0];
  }

  /** `undefined` mantém o valor atual; `null` limpa. */
  async updateDados(
    id: string,
    data: { modelo?: string | null; modeloId?: string; protocolo?: string | null },
    executor: Queryable = this.pool,
  ): Promise<RastreadorEntity> {
    const { rows } = await executor.query<RastreadorEntity>(
      `update rastreadores set
         modelo = case when $2 then $3 else modelo end,
         protocolo = case when $4 then $5 else protocolo end,
         modelo_id = coalesce($6, modelo_id),
         atualizado_em = now()
       where id = $1 returning *`,
      [id, data.modelo !== undefined, data.modelo ?? null, data.protocolo !== undefined, data.protocolo ?? null, data.modeloId ?? null],
    );
    return rows[0];
  }

  async updateStatus(
    id: string,
    status: RastreadorEntity['status'],
    executor: Queryable = this.pool,
  ): Promise<RastreadorEntity | null> {
    const { rows } = await executor.query<RastreadorEntity>(
      `update rastreadores set status = $1, atualizado_em = now() where id = $2 returning *`,
      [status, id],
    );
    return rows[0] ?? null;
  }
}
