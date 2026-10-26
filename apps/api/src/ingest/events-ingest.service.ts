import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { resolverInstalacaoVigente } from './instalacao-vigente';
import type { NormalizedEvent } from './traccar-event.mapper';

export type EventIngestResult =
  | { status: 'deduped' }
  | { status: 'rastreador_desconhecido' }
  | { status: 'gravado'; eventoId: string; clientId: string | null; assetId: string | null };

/**
 * Mesmo algoritmo da ingestão de posições (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.5): reserva
 * `(rastreador_id, traccar_event_id)` em `ingest_eventos_recebidos` — o Traccar reenvia em retry e o
 * reenvio cai aqui — grava o evento e fecha a reserva, tudo numa transação.
 */
@Injectable()
export class EventsIngestService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async ingest(evento: NormalizedEvent): Promise<EventIngestResult> {
    return withTransaction(this.pool, async (client) => {
      const rastreador = await client.query<{ id: string }>('select id from rastreadores where traccar_device_id = $1', [
        evento.traccarDeviceId,
      ]);
      if (rastreador.rowCount === 0) return { status: 'rastreador_desconhecido' as const };
      const rastreadorId = rastreador.rows[0].id;

      const reserva = await client.query(
        `insert into ingest_eventos_recebidos (rastreador_id, traccar_event_id) values ($1, $2)
         on conflict (rastreador_id, traccar_event_id) do nothing returning rastreador_id`,
        [rastreadorId, evento.traccarEventId],
      );
      if (reserva.rowCount === 0) return { status: 'deduped' as const };

      const { clientId, assetId } = await resolverInstalacaoVigente(client, rastreadorId, evento.ts);
      // referência lógica à posição (sem FK, § 4.5): só se ela já foi ingerida; senão fica null
      const posicao = evento.traccarPositionId
        ? await client.query<{ posicao_id: string }>(
            `select posicao_id from ingest_posicoes_recebidas where rastreador_id = $1 and traccar_position_id = $2`,
            [rastreadorId, evento.traccarPositionId],
          )
        : null;
      const { rows } = await client.query<{ id: string }>(
        `insert into eventos (rastreador_id, client_id, asset_id, origem, tipo, ts, traccar_event_id, posicao_id)
         values ($1, $2, $3, 'aparelho', $4, $5, $6, $7) returning id`,
        [rastreadorId, clientId, assetId, evento.tipo, evento.ts, evento.traccarEventId, posicao?.rows[0]?.posicao_id ?? null],
      );
      await client.query(
        'update ingest_eventos_recebidos set evento_id = $1 where rastreador_id = $2 and traccar_event_id = $3',
        [rows[0].id, rastreadorId, evento.traccarEventId],
      );
      return { status: 'gravado' as const, eventoId: rows[0].id, clientId, assetId };
    });
  }
}
