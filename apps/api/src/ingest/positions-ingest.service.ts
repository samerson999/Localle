import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Alerta } from '@localle/shared/realtime';
import { alertaDoAlarme } from '../alertas/alarmes-aparelho';
import { inserirAlerta } from '../alertas/alertas.repository';
import { detectarCercas } from '../cercas/cerca-detector';
import { avaliarRegras } from '../regras/motor-regras';
import { resolverInstalacaoVigente } from './instalacao-vigente';
import type { NormalizedPosition } from './traccar-position.mapper';

export type IngestResult =
  | { status: 'deduped' }
  | { status: 'rastreador_desconhecido' }
  | {
      status: 'gravada';
      posicaoId: string;
      rastreadorId: string;
      clientId: string | null;
      assetId: string | null;
      /** `true` quando esta posição passou a ser a `ultima_posicao` do rastreador (válida e mais recente). */
      atualizouUltimaPosicao: boolean;
      eventos: EventoGravado[];
      /** Alertas criados nesta transação (para o worker publicar em tempo real). */
      alertas: Alerta[];
    };

export interface EventoGravado {
  id: string;
  tipo: string;
  ts: Date;
  attributes?: Record<string, unknown>;
  /** Decidido pelo backend (ex.: cerca com alerta ligado); ausente = o evento não pede alerta próprio. */
  alerta?: { titulo: string; prioridade: 'alta' | 'media' | 'baixa' } | null;
}

/**
 * Implementa o algoritmo de docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.3: reserva a identidade da
 * posição em `ingest_posicoes_recebidas` (on conflict do nothing), grava a posição, e só então marca a
 * reserva como resolvida — o commit acontece depois desse segundo update, nunca antes. Roda numa única
 * transação por posição (volume baixo por chamada: um worker da fila processa uma posição por job).
 */
@Injectable()
export class PositionsIngestService {
  private readonly logger = new Logger(PositionsIngestService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async ingest(position: NormalizedPosition): Promise<IngestResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const rastreador = await client.query<{ id: string; protocolo: string | null; modelo_protocolo: string | null; modelo: string | null }>(
        `select r.id, r.protocolo, m.protocolo as modelo_protocolo, r.modelo
           from rastreadores r left join rastreador_modelos m on m.id = r.modelo_id
          where r.traccar_device_id = $1`,
        [position.traccarDeviceId],
      );
      if (rastreador.rowCount === 0) {
        await client.query('rollback');
        return { status: 'rastreador_desconhecido' };
      }
      const rastreadorId = rastreador.rows[0].id;
      // O protocolo é o que o Traccar usou para decodificar (definido pela porta em que o aparelho conecta),
      // não digitado no cadastro: o Traccar não expõe lista de protocolos pela API. Só grava quando muda.
      if (position.protocol && position.protocol !== rastreador.rows[0].protocolo) {
        await client.query('update rastreadores set protocolo = $2, atualizado_em = now() where id = $1', [rastreadorId, position.protocol]);
        this.logger.log(`rastreador_id=${rastreadorId} protocolo detectado: ${rastreador.rows[0].protocolo ?? '(vazio)'} → ${position.protocol}`);
        // decisão de 28/10/2026: protocolo diferente do modelo grava e avisa (a tela de Rastreadores marca a divergência)
        const esperado = rastreador.rows[0].modelo_protocolo;
        if (esperado && esperado !== position.protocol) {
          this.logger.warn(
            `rastreador_id=${rastreadorId} protocolo ${position.protocol} diferente do modelo ${rastreador.rows[0].modelo} (${esperado}): aparelho na porta de outro protocolo ou modelo cadastrado errado`,
          );
        }
      }

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

      const { clientId, assetId } = await resolverInstalacaoVigente(client, rastreadorId, position.fixTime);

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
      const atualizouUltimaPosicao = position.valid
        ? await this.atualizarUltimaPosicao(client, rastreadorId, assetId, clientId, posicaoId, position)
        : false;
      const eventos: EventoGravado[] = await this.gravarAlarmes(client, rastreadorId, assetId, clientId, posicaoId, position);
      if (position.valid && clientId && assetId) {
        eventos.push(
          ...(await detectarCercas(client, {
            clientId,
            assetId,
            rastreadorId,
            posicaoId,
            fixTime: position.fixTime,
            longitude: position.longitude,
            latitude: position.latitude,
          })),
        );
      }

      // regras só sobre a posição mais nova do ativo: posição atrasada avaliaria estado velho
      if (atualizouUltimaPosicao && clientId && assetId) {
        eventos.push(...(await avaliarRegras(client, { clientId, assetId, rastreadorId, posicaoId, position })));
      }

      const alertas: Alerta[] = [];
      if (clientId) {
        for (const e of eventos) {
          if (!e.alerta) continue;
          alertas.push(
            await inserirAlerta(client, {
              clientId,
              assetId,
              eventoId: e.id,
              origem: e.tipo === 'regra' ? 'regra' : e.tipo.startsWith('cerca_') ? 'cerca' : 'aparelho',
              tipo: e.tipo,
              titulo: e.alerta.titulo,
              // regra: mesma informação que a simulação mostrava ("placa · velocidade"; a placa o front junta)
              detalhe: e.tipo === 'regra' && position.speedKmh !== null ? `${Math.round(position.speedKmh)} km/h` : null,
              prioridade: e.alerta.prioridade,
              ts: e.ts,
            }),
          );
        }
      }

      await client.query('commit');
      return { status: 'gravada', posicaoId, rastreadorId, clientId, assetId, atualizouUltimaPosicao, eventos, alertas };
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
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
         -- greatest ignora null e não deixa pacote atrasado (fix_time antigo) regredir o valor
         ultima_posicao_valida_em = greatest(excluded.ultima_posicao_valida_em, rastreador_comunicacao.ultima_posicao_valida_em),
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
  ): Promise<boolean> {
    const { rowCount } = await client.query(
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
    return (rowCount ?? 0) > 0;
  }

  /**
   * Alarme do aparelho chega dentro da posição (`attributes.alarm`), então o dedup da posição (reserva em
   * `ingest_posicoes_recebidas`, mesma transação) já impede evento duplicado — `traccar_event_id` fica
   * null. `ingest_eventos_recebidos` continua reservado para quando o Forwarding de eventos do Traccar
   * (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.1) for ligado.
   */
  private async gravarAlarmes(
    client: PoolClient,
    rastreadorId: string,
    assetId: string | null,
    clientId: string | null,
    posicaoId: string,
    position: NormalizedPosition,
  ): Promise<EventoGravado[]> {
    const eventos: EventoGravado[] = [];
    for (const alarme of position.alarms) {
      const { rows } = await client.query<{ id: string }>(
        `insert into eventos (rastreador_id, client_id, asset_id, origem, tipo, ts, posicao_id, attributes)
         values ($1, $2, $3, 'aparelho', $4, $5, $6, $7)
         returning id`,
        [rastreadorId, clientId, assetId, alarme, position.fixTime, posicaoId, { traccarPositionId: position.traccarPositionId }],
      );
      eventos.push({ id: rows[0].id, tipo: alarme, ts: position.fixTime, alerta: alertaDoAlarme(alarme) });
    }
    return eventos;
  }
}
