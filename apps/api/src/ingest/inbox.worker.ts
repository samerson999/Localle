import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { ComandosService } from '../comandos/comandos.service';
import { PositionsWorker } from '../queue/positions.worker';
import { RealtimeHub } from '../realtime/realtime.hub';
import { EventsIngestService } from './events-ingest.service';
import { INBOX_MAX_TENTATIVAS, InboxRepository, type InboxRow } from './inbox.repository';
import { mapTraccarEvent, type TraccarEventForward } from './traccar-event.mapper';
import type { TraccarPositionPayload } from './traccar-position.mapper';

const LOTE = 100;
const POLL_MS = 1000;
const LIMPEZA_MS = 3600_000;

/**
 * Consome `ingest_inbox` pelo protocolo de lease (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.1). Vários
 * processos da API podem rodar isto ao mesmo tempo: `for update skip locked` garante que dois nunca pegam
 * a mesma linha, e um processo que morre no meio só deixa o lease vencer. A gravação reusa a lógica
 * idempotente da ingestão de posições e o dedup de `ingest_eventos_recebidos`.
 */
@Injectable()
export class InboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxWorker.name);
  private readonly workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  private timer?: NodeJS.Timeout;
  private limpeza?: NodeJS.Timeout;
  private parado = false;

  constructor(
    private readonly inbox: InboxRepository,
    private readonly positions: PositionsWorker,
    private readonly events: EventsIngestService,
    private readonly realtime: RealtimeHub,
    private readonly comandos: ComandosService,
  ) {}

  onModuleInit(): void {
    if (process.env.INBOX_WORKER_ENABLED === 'false') return;
    this.logger.log(`Worker do inbox de ingestão ligado (${this.workerId})`);
    this.agendar(0);
    this.limpeza = setInterval(() => void this.limpar(), LIMPEZA_MS);
  }

  onModuleDestroy(): void {
    this.parado = true;
    clearTimeout(this.timer);
    clearInterval(this.limpeza);
  }

  /** Processa um lote e devolve quantas linhas reivindicou. Público para o teste chamar sem timer. */
  async processarLote(limite = LOTE): Promise<number> {
    const linhas = await this.inbox.reivindicar(this.workerId, limite);
    const concluidas: string[] = [];
    for (const linha of linhas) {
      try {
        await this.processar(linha);
        concluidas.push(linha.id);
      } catch (err) {
        const msg = (err as Error).message;
        if (linha.tentativas >= INBOX_MAX_TENTATIVAS) {
          this.logger.error(
            `Inbox ${linha.id} (${linha.tipo}) esgotou ${INBOX_MAX_TENTATIVAS} tentativas — fica para análise manual: ${msg}`,
          );
        } else {
          this.logger.warn(`Inbox ${linha.id} (${linha.tipo}) falhou na tentativa ${linha.tentativas}: ${msg}`);
        }
        await this.inbox.falhar(linha.id, msg);
      }
    }
    await this.inbox.concluir(concluidas);
    return linhas.length;
  }

  private async processar(linha: InboxRow): Promise<void> {
    if (linha.tipo === 'posicao') {
      const { position } = linha.payload as { position: TraccarPositionPayload };
      await this.positions.process({ id: `inbox-${linha.id}`, data: position });
      return;
    }
    const bruto = (linha.payload as TraccarEventForward).event;
    if (bruto.type === 'commandResult') {
      // resultado de comando (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.4): não vira linha em `eventos`
      await this.comandos.receberResultado(bruto.deviceId, bruto.attributes ?? {}, new Date((bruto.eventTime ?? bruto.serverTime)!), bruto.id);
      return;
    }
    const evento = mapTraccarEvent(linha.payload as TraccarEventForward);
    if (!evento) return; // tipo que não vira evento de produto (ver traccar-event.mapper.ts)
    const result = await this.events.ingest(evento);
    if (result.status === 'rastreador_desconhecido') {
      this.logger.warn(`Evento descartado: traccar_device_id ${evento.traccarDeviceId} não cadastrado (inbox ${linha.id})`);
    }
    if (result.status === 'gravado' && result.clientId) {
      try {
        await this.realtime.publish(result.clientId, {
          kind: 'evento',
          id: String(result.eventoId),
          assetId: result.assetId,
          tipo: evento.tipo,
          ts: evento.ts.toISOString(),
        });
      } catch (err) {
        this.logger.warn(`Tempo real não publicado (inbox ${linha.id}, evento ${result.eventoId}): ${(err as Error).message}`);
      }
    }
  }

  private agendar(ms: number) {
    if (this.parado) return;
    this.timer = setTimeout(() => void this.ciclo(), ms);
  }

  private async ciclo() {
    let reivindicadas = 0;
    try {
      reivindicadas = await this.processarLote();
    } catch (err) {
      this.logger.error(`Falha ao ler o inbox de ingestão: ${(err as Error).message}`);
    }
    // lote cheio: provavelmente há mais pendentes — segue sem esperar
    this.agendar(reivindicadas >= LOTE ? 0 : POLL_MS);
  }

  private async limpar() {
    try {
      const removidas = await this.inbox.limparProcessados();
      if (removidas > 0) this.logger.log(`Inbox: ${removidas} linhas processadas há mais de 3 dias removidas`);
    } catch (err) {
      this.logger.error(`Falha na limpeza do inbox: ${(err as Error).message}`);
    }
  }
}
