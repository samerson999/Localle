import { Injectable, Logger } from '@nestjs/common';
import { RealtimeHub } from '../realtime/realtime.hub';
import { admitirPosicao } from './admissao-posicao';
import { PositionsIngestService, type IngestResult } from './positions-ingest.service';
import type { NormalizedPosition } from './traccar-position.mapper';

/**
 * Uma posição crua do Traccar até o banco e o mapa, venha de onde vier (Forwarding, conciliação, polling — todas pelo
 * `ingest_inbox`): admissão (admissao-posicao.ts) → gravação idempotente (PositionsIngestService) → publicação em tempo
 * real depois do commit. Antes, isto morava no consumidor do BullMQ (PositionsWorker), e o worker do inbox o usava
 * emprestado; com o inbox como fila única (05/11/2026), o BullMQ saiu do caminho das posições.
 */
@Injectable()
export class ProcessadorPosicao {
  private readonly logger = new Logger(ProcessadorPosicao.name);

  constructor(
    private readonly ingest: PositionsIngestService,
    private readonly realtime: RealtimeHub,
  ) {}

  /** `ref` identifica a origem no log (ex.: `inbox 123`). Erro de banco propaga: quem chamou decide o retry. */
  async processar(bruta: unknown, ref: string): Promise<IngestResult> {
    // formato inválido não adianta retentar: recusa com o motivo e segue
    const admissao = admitirPosicao(bruta);
    if (!admissao.ok) {
      const deviceId = (bruta as { deviceId?: unknown } | null)?.deviceId;
      this.logger.warn(`Posição recusada na admissão — ${admissao.motivo} — traccar_device_id ${typeof deviceId === 'number' ? deviceId : '?'} (${ref})`);
      return { status: 'recusada', motivo: admissao.motivo };
    }
    const position = admissao.posicao;
    const result = await this.ingest.ingest(position);
    if (result.status === 'rastreador_desconhecido') {
      this.logger.warn(`Posição descartada: traccar_device_id ${position.traccarDeviceId} não cadastrado (${ref})`);
    }
    if (result.status === 'gravada') await this.publicar(result, position, ref);
    return result;
  }

  /**
   * Depois do commit: a posição já está no banco, então falha aqui não pode falhar o processamento — o reprocesso cairia
   * no dedup e não republicaria nada. O front se recupera pelo snapshot/`since` na reconexão
   * (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.2), por isso é warn e não error.
   */
  private async publicar(result: Extract<IngestResult, { status: 'gravada' }>, position: NormalizedPosition, ref: string) {
    if (!result.clientId) return;
    try {
      if (result.atualizouUltimaPosicao && result.assetId) {
        await this.realtime.publish(result.clientId, {
          kind: 'posicao',
          assetId: result.assetId,
          rastreadorId: result.rastreadorId,
          fixTime: position.fixTime.toISOString(),
          lat: position.latitude,
          lon: position.longitude,
          speedKmh: position.speedKmh,
          ignition: position.ignition,
          telemetria: result.telemetria,
        });
      }
      for (const e of result.eventos) {
        await this.realtime.publish(result.clientId, {
          kind: 'evento',
          id: String(e.id),
          assetId: result.assetId,
          tipo: e.tipo,
          ts: e.ts.toISOString(),
          attributes: e.attributes,
        });
      }
      for (const alerta of result.alertas) {
        await this.realtime.publish(result.clientId, { kind: 'alerta', alerta });
      }
    } catch (err) {
      this.logger.warn(
        `Tempo real não publicado (${ref}, posicao_id ${result.posicaoId}, client_id ${result.clientId}): ${(err as Error).message}`,
      );
    }
  }
}
