import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { BaseRepository } from '../db/base.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { RastreadorDoCliente, RastreadorVinculoEntity } from './rastreador-vinculo.entity';

/**
 * Vínculo rastreador × cliente (`rastreador_vinculos`, tem `client_id`): estende `BaseRepository` e todo
 * método próprio recebe `clientId` primeiro e filtra por ele — exceto `vigentePorRastreador`, usado só pela
 * camada de superadmin, que decide a quem vincular. Sobreposição de vínculos é barrada no banco
 * (exclusion constraint da migration), não aqui.
 */
@Injectable()
export class RastreadorVinculosRepository extends BaseRepository<RastreadorVinculoEntity> {
  protected readonly table = 'rastreador_vinculos';

  constructor(@Inject(PG_POOL) pool: Pool) {
    super(pool);
  }

  async vincular(clientId: string, rastreadorId: string, executor: Queryable = this.pool): Promise<RastreadorVinculoEntity> {
    const { rows } = await executor.query<RastreadorVinculoEntity>(
      'insert into rastreador_vinculos (client_id, rastreador_id) values ($1, $2) returning *',
      [clientId, rastreadorId],
    );
    return rows[0];
  }

  /** Superadmin: vínculo vigente do rastreador, de qualquer cliente. `for update` trava contra corrida. */
  async vigentePorRastreador(rastreadorId: string, executor: Queryable = this.pool): Promise<RastreadorVinculoEntity | null> {
    const { rows } = await executor.query<RastreadorVinculoEntity>(
      'select * from rastreador_vinculos where rastreador_id = $1 and desvinculado_em is null for update',
      [rastreadorId],
    );
    return rows[0] ?? null;
  }

  /** Vínculo vigente do rastreador COM este cliente — `null` se for de outro cliente ou não vinculado. */
  async vigenteDoCliente(clientId: string, rastreadorId: string, executor: Queryable = this.pool): Promise<RastreadorVinculoEntity | null> {
    const { rows } = await executor.query<RastreadorVinculoEntity>(
      `select * from rastreador_vinculos
        where client_id = $1 and rastreador_id = $2 and desvinculado_em is null for update`,
      [clientId, rastreadorId],
    );
    return rows[0] ?? null;
  }

  async encerrar(clientId: string, id: string, executor: Queryable = this.pool): Promise<RastreadorVinculoEntity | null> {
    const { rows } = await executor.query<RastreadorVinculoEntity>(
      `update rastreador_vinculos set desvinculado_em = now()
        where client_id = $1 and id = $2 and desvinculado_em is null returning *`,
      [clientId, id],
    );
    return rows[0] ?? null;
  }

  /** Rastreadores vinculados ao cliente agora, com a instalação vigente (se houver) no ativo dele. */
  async doCliente(clientId: string): Promise<RastreadorDoCliente[]> {
    const { rows } = await this.pool.query<RastreadorDoCliente>(
      `select r.id, r.imei, r.modelo, r.protocolo, v.vinculado_em,
              i.id as instalacao_id, i.asset_id, a.plate as asset_plate, i.instalado_em,
              rc.ultimo_pacote_em
         from rastreador_vinculos v
         join rastreadores r on r.id = v.rastreador_id
         left join instalacoes i on i.rastreador_id = r.id and i.client_id = v.client_id and i.desinstalado_em is null
         left join assets a on a.id = i.asset_id and a.client_id = v.client_id
         left join rastreador_comunicacao rc on rc.rastreador_id = r.id
        where v.client_id = $1 and v.desvinculado_em is null and r.status <> 'desativado'
        order by r.imei`,
      [clientId],
    );
    return rows;
  }
}
