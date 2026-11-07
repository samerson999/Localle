import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { ComandosService } from '../comandos/comandos.service';
import { ProcessadorPosicao } from './processador-posicao';
import { RealtimeHub } from '../realtime/realtime.hub';
import { EventsIngestService } from './events-ingest.service';
import { diasControleDuplicidade, type Faixa, INBOX_MAX_TENTATIVAS, InboxRepository, type InboxRow } from './inbox.repository';
import { mapTraccarEvent, type TraccarEventForward } from './traccar-event.mapper';
import type { TraccarPositionPayload } from './traccar-position.mapper';

const LOTE = 100;
const POLL_MS = 1000;
const LIMPEZA_MS = 3600_000;

/**
 * Faixas de processamento paralelo neste processo (`INBOX_FAIXAS`, padrão 1 = uma linha por vez, como sempre foi). Cada
 * rastreador cai sempre na mesma faixa (inbox.repository.ts), então a ordem por veículo se mantém; cada faixa usa uma
 * conexão do pool durante a gravação — DATABASE_POOL_MAX precisa folgar acima disto.
 */
export function faixasDoInbox(): number {
  const v = Math.floor(Number(process.env.INBOX_FAIXAS));
  return Number.isFinite(v) && v >= 1 && v <= 32 ? v : 1;
}

/**
 * Consome `ingest_inbox` pelo protocolo de lease (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.1). Vários
 * processos da API podem rodar isto ao mesmo tempo: `for update skip locked` garante que dois nunca pegam
 * a mesma linha, e um processo que morre no meio só deixa o lease vencer. A gravação reusa a lógica
 * idempotente da ingestão de posições e o dedup de `ingest_eventos_recebidos`. Com `INBOX_FAIXAS` > 1, o processo roda
 * uma volta por faixa ao mesmo tempo (posições de rastreadores diferentes gravadas em paralelo).
 */
@Injectable()
export class InboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxWorker.name);
  private readonly workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  private readonly timers = new Map<number, NodeJS.Timeout>();
  private limpeza?: NodeJS.Timeout;
  private parado = false;
  /** Voltas em andamento (uma por faixa): o desligamento espera por elas (termina a linha atual e devolve o resto do lote). */
  private readonly ciclosAtuais = new Map<number, Promise<void>>();

  constructor(
    private readonly inbox: InboxRepository,
    private readonly positions: ProcessadorPosicao,
    private readonly events: EventsIngestService,
    private readonly realtime: RealtimeHub,
    private readonly comandos: ComandosService,
  ) {}

  onModuleInit(): void {
    if (process.env.INBOX_WORKER_ENABLED === 'false') return;
    const total = faixasDoInbox();
    this.logger.log(`Worker do inbox de ingestão ligado (${this.workerId}, ${total} faixa(s))`);
    for (let indice = 0; indice < total; indice++) this.agendar(total > 1 ? { indice, total } : null, 0);
    this.limpeza = setInterval(() => void this.limpar(), LIMPEZA_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.parado = true;
    for (const t of this.timers.values()) clearTimeout(t);
    clearInterval(this.limpeza);
    await Promise.all(this.ciclosAtuais.values());
  }

  /** Processa um lote e devolve quantas linhas reivindicou. Público para o teste chamar sem timer. */
  async processarLote(limite = LOTE, faixa: Faixa | null = null): Promise<number> {
    const linhas = await this.inbox.reivindicar(this.workerId, limite, undefined, undefined, faixa);
    const concluidas: string[] = [];
    for (const [i, linha] of linhas.entries()) {
      if (this.parado) {
        // desligando: as que nem começaram voltam ao inbox na hora (sem contar tentativa), em vez de esperar o lease vencer
        const resto = linhas.slice(i).map((l) => l.id);
        await this.inbox.devolver(resto);
        this.logger.log(`Desligando: ${resto.length} linha(s) do inbox devolvida(s) sem processar (${this.workerId})`);
        break;
      }
      try {
        const recusa = await this.processar(linha);
        // recusada na admissão (formato): retentar não conserta — conclui guardando o motivo na linha (auditoria, 3 dias)
        if (recusa) await this.inbox.recusar(linha.id, recusa);
        else concluidas.push(linha.id);
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

  /** Devolve o motivo quando a posição é recusada na admissão; exceção = falha de processamento (vai para o retry). */
  private async processar(linha: InboxRow): Promise<string | null> {
    if (linha.tipo === 'posicao') {
      const { position } = linha.payload as { position: TraccarPositionPayload };
      const r = await this.positions.processar(position, `inbox ${linha.id}`);
      return r.status === 'recusada' ? r.motivo : null;
    }
    const bruto = (linha.payload as TraccarEventForward).event;
    if (bruto.type === 'commandResult') {
      // resultado de comando (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.4): não vira linha em `eventos`
      await this.comandos.receberResultado(bruto.deviceId, bruto.attributes ?? {}, new Date((bruto.eventTime ?? bruto.serverTime)!), bruto.id);
      return null;
    }
    const evento = mapTraccarEvent(linha.payload as TraccarEventForward);
    if (!evento) return null; // tipo que não vira evento de produto (ver traccar-event.mapper.ts)
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
    return null;
  }

  private agendar(faixa: Faixa | null, ms: number) {
    if (this.parado) return;
    const k = faixa?.indice ?? 0;
    this.timers.set(
      k,
      setTimeout(() => {
        this.ciclosAtuais.set(k, this.ciclo(faixa).finally(() => this.ciclosAtuais.delete(k)));
      }, ms),
    );
  }

  private async ciclo(faixa: Faixa | null) {
    let reivindicadas = 0;
    try {
      reivindicadas = await this.processarLote(LOTE, faixa);
    } catch (err) {
      this.logger.error(`Falha ao ler o inbox de ingestão${faixa ? ` (faixa ${faixa.indice + 1}/${faixa.total})` : ''}: ${(err as Error).message}`);
    }
    // lote cheio: provavelmente há mais pendentes — segue sem esperar
    this.agendar(faixa, reivindicadas >= LOTE ? 0 : POLL_MS);
  }

  private async limpar() {
    try {
      const removidas = await this.inbox.limparProcessados();
      if (removidas > 0) this.logger.log(`Inbox: ${removidas} linhas processadas há mais de 3 dias removidas`);
    } catch (err) {
      this.logger.error(`Falha na limpeza do inbox: ${(err as Error).message}`);
    }
    // esgotada só gerava um log no momento da última tentativa: o lembrete de hora em hora não deixa ela cair no esquecimento
    try {
      const e = await this.inbox.esgotadas();
      if (e.total > 0) {
        this.logger.warn(
          `Inbox: ${e.total} linha(s) esgotaram ${INBOX_MAX_TENTATIVAS} tentativas e esperam análise manual (mais antiga: inbox ${e.maisAntigaId}, erro: ${e.erro ?? '-'})`,
        );
      }
    } catch (err) {
      this.logger.error(`Falha ao contar linhas esgotadas do inbox: ${(err as Error).message}`);
    }
    const dias = diasControleDuplicidade();
    try {
      const r = await this.inbox.limparControleDuplicidade(dias);
      if (r.posicoes || r.eventos) {
        this.logger.log(`Controle de duplicidade: ${r.posicoes} posição(ões) e ${r.eventos} evento(s) recebidos há mais de ${dias} dias removidos`);
      }
    } catch (err) {
      this.logger.error(`Falha na limpeza do controle de duplicidade (> ${dias} dias): ${(err as Error).message}`);
    }
  }
}
