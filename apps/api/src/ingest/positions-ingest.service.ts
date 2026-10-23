import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { NormalizedPosition } from './traccar-position.mapper';

export type IngestResult =
  | { status: 'deduped' }
  | { status: 'rastreador_desconhecido' }
  | { status: 'gravada'; posicaoId: string; clientId: string | null; assetId: string | null };

/**
 * Implementa o algoritmo de docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.3: reserva a identidade da
 * posição em `ingest_posicoes_recebidas` (on conflict do nothing), grava a posição, e só então marca a
 * reserva como resolvida — o commit acontece depois desse segundo update, nunca antes. Roda numa única
 * transação por posição (volume baixo por chamada: um worker da fila processa uma posição por job).
 */
@Injectable()
export class PositionsIngestService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async ingest(position: NormalizedPosition): Promise<IngestResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const rastreador = await client.query<{ id: string }>(
        'select id from rastreadores where traccar_device_id = $1',
        [position.traccarDeviceId],
      );
      if (rastreador.rowCount === 0) {
        await client.query('rollback');
        return { status: 'rastreador_desconhecido' };
      }
      const rastreadorId = rastreador.rows[0].id;

      const reserva = await client.query(
        `insert into ingest_posicoes_recebidas (rastreador_id, traccar_position_id)
         values ($1, $2) on conflict (rastreador_id, traccar_position_id) do nothing
         returning rastreador_id`,
        [rastreadorId, position.traccarPositionId],
      );
      if (reserva.rowCount === 0) {
        await client.query('rollback');
        return { status: 'deduped' };
      }

      const { clientId, assetId } = await this.resolverInstalacaoVigente(client, rastreadorId, position.fixTime);

      const inserted = await client.query<{ id: string }>(
        `insert into posicoes
          (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom,
           speed_kmh, course, altitude, odometer_m, ignition, attributes)
         values ($1, $2, $3, $4, $5, $6, $7, st_setsrid(st_makepoint($8, $9), 4326), $10, $11, $12, $13, $14, $15)
         returning id`,
        [
          rastreadorId,
          position.traccarPositionId,
          clientId,
          assetId,
          position.fixTime,
          position.serverTime,
          position.valid,
          position.longitude,
          position.latitude,
          position.speedKmh,
          position.course,
          position.altitude,
          position.odometerM,
          position.ignition,
          position.attributes,
        ],
      );
      const posicaoId = inserted.rows[0].id;

      await client.query(
        `update ingest_posicoes_recebidas set posicao_id = $1
         where rastreador_id = $2 and traccar_position_id = $3`,
        [posicaoId, rastreadorId, position.traccarPositionId],
      );

      await this.atualizarComunicacao(client, rastreadorId, assetId, clientId, position);
      if (position.valid) {
        await this.atualizarUltimaPosicao(client, rastreadorId, assetId, clientId, posicaoId, position);
      }

      await client.query('commit');
      return { status: 'gravada', posicaoId, clientId, assetId };
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  private async resolverInstalacaoVigente(
    client: PoolClient,
    rastreadorId: string,
    fixTime: Date,
  ): Promise<{ clientId: string | null; assetId: string | null }> {
    const { rows } = await client.query<{ client_id: string; asset_id: string }>(
      `select client_id, asset_id from instalacoes
       where rastreador_id = $1 and papel = 'principal'
         and instalado_em <= $2 and (desinstalado_em is null or desinstalado_em > $2)
       order by instalado_em desc limit 1`,
      [rastreadorId, fixTime],
    );
    return { clientId: rows[0]?.client_id ?? null, assetId: rows[0]?.asset_id ?? null };
  }

  private async atualizarComunicacao(
    client: PoolClient,
    rastreadorId: string,
    assetId: string | null,
    clientId: string | null,
    position: NormalizedPosition,
  ): Promise<void> {
    await client.query(
      `insert into rastreador_comunicacao (rastreador_id, asset_id, client_id, ultimo_pacote_em, ultima_posicao_valida_em)
       values ($1, $2, $3, now(), case when $4 then $5::timestamptz else null end)
       on conflict (rastreador_id) do update set
         asset_id = excluded.asset_id,
         client_id = excluded.client_id,
         ultimo_pacote_em = excluded.ultimo_pacote_em,
         ultima_posicao_valida_em = coalesce(excluded.ultima_posicao_valida_em, rastreador_comunicacao.ultima_posicao_valida_em),
         atualizado_em = now()`,
      [rastreadorId, assetId, clientId, position.valid, position.fixTime],
    );
  }

  private async atualizarUltimaPosicao(
    client: PoolClient,
    rastreadorId: string,
    assetId: string | null,
    clientId: string | null,
    posicaoId: string,
    position: NormalizedPosition,
  ): Promise<void> {
    await client.query(
      `insert into ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom, speed_kmh, ignition)
       values ($1, $2, $3, $4, $5, st_setsrid(st_makepoint($6, $7), 4326), $8, $9)
       on conflict (rastreador_id) do update set
         asset_id = excluded.asset_id, client_id = excluded.client_id,
         posicao_id = excluded.posicao_id, fix_time = excluded.fix_time,
         geom = excluded.geom, speed_kmh = excluded.speed_kmh, ignition = excluded.ignition,
         atualizado_em = now()
       where excluded.fix_time > ultima_posicao.fix_time`,
      [rastreadorId, assetId, clientId, posicaoId, position.fixTime, position.longitude, position.latitude, position.speedKmh, position.ignition],
    );
  }
}
