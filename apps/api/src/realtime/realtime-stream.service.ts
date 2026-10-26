import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { RealtimeMessage, RealtimePosicao } from '@localle/shared/realtime';
import { MonitoringRepository } from '../monitoring/monitoring.repository';
import { RealtimeHub } from './realtime.hub';

/**
 * Protocolo de conexão de docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.2 (segunda passada): assina o canal
 * do tenant ANTES do snapshot e guarda em buffer o que chegar no meio; manda o snapshot; manda os eventos
 * persistidos desde `since` (pub/sub não tem replay); só então drena o buffer, descartando posição que o
 * snapshot já cobre (por `fixTime` do rastreador) e evento já enviado. Daí em diante, repassa direto.
 */
@Injectable()
export class RealtimeStreamService {
  private readonly logger = new Logger(RealtimeStreamService.name);

  constructor(
    private readonly hub: RealtimeHub,
    private readonly repo: MonitoringRepository,
  ) {}

  open(clientId: string, since: Date | null): Observable<RealtimeMessage> {
    return new Observable<RealtimeMessage>((subscriber) => {
      let unsubscribe: (() => Promise<void>) | undefined;
      let closed = false;
      let live = false;
      const buffer: RealtimeMessage[] = [];

      const start = async () => {
        unsubscribe = await this.hub.subscribe(clientId, (message) => {
          if (live) subscriber.next(message);
          else buffer.push(message);
        });
        if (closed) return void (await unsubscribe());

        const frota = await this.repo.frotaAtual(clientId);
        const posicoes: RealtimePosicao[] = frota
          .filter((r) => r.fix_time !== null && r.rastreador_id !== null)
          .map((r) => ({
            kind: 'posicao',
            assetId: r.asset_id,
            rastreadorId: r.rastreador_id!,
            fixTime: r.fix_time!.toISOString(),
            lat: Number(r.latitude),
            lon: Number(r.longitude),
            speedKmh: r.speed_kmh === null ? null : Number(r.speed_kmh),
            ignition: r.ignition,
          }));
        subscriber.next({ kind: 'snapshot', posicoes });

        const enviados = new Set<string>();
        if (since) {
          const eventos = await this.repo.eventos(clientId, since, new Date(), null);
          for (const e of eventos.reverse()) {
            enviados.add(String(e.id));
            subscriber.next({ kind: 'evento', id: String(e.id), assetId: e.asset_id, tipo: e.tipo, ts: e.ts.toISOString() });
          }
        }

        const versao = new Map(posicoes.map((p) => [p.rastreadorId, p.fixTime]));
        for (const message of buffer) {
          if (message.kind === 'posicao') {
            const noSnapshot = versao.get(message.rastreadorId);
            if (noSnapshot && new Date(message.fixTime) <= new Date(noSnapshot)) continue;
          }
          if (message.kind === 'evento' && enviados.has(message.id)) continue;
          subscriber.next(message);
        }
        buffer.length = 0;
        live = true;
      };

      start().catch((err: Error) => {
        this.logger.error(`Falha ao abrir stream de tempo real do client_id ${clientId}: ${err.message}`);
        subscriber.error(err);
      });

      return () => {
        closed = true;
        void unsubscribe?.();
      };
    });
  }
}
