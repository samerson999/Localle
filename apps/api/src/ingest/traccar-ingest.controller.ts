import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator';
import { validarEventoForward, validarPosicaoForward } from './dto/traccar-forward.dto';
import { InboxRepository, type InboxTipo } from './inbox.repository';

/**
 * Recebe o Forwarding do Traccar (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.1). `@Public()` porque o
 * Traccar não tem JWT: a autenticação é a chave `X-Traccar-Ingest-Key` (`forward.header` no Traccar,
 * `TRACCAR_INGEST_KEY` aqui). Sem a variável configurada, recusa tudo (fail-closed). Responde 202 só
 * depois do commit no `ingest_inbox`; banco fora → 503 e o retry do próprio Traccar reenvia.
 */
@Controller('ingest/traccar')
@Public()
export class TraccarIngestController {
  private readonly logger = new Logger(TraccarIngestController.name);
  private avisouSemChave = false;
  /** Recusas por validação, agrupadas pelo motivo: um aviso por minuto por motivo, com quantas vieram no meio. */
  private readonly recusas = new Map<string, { ultimoAviso: number; suprimidas: number }>();

  constructor(private readonly inbox: InboxRepository) {}

  @Post('positions')
  @HttpCode(202)
  async positions(@Headers('x-traccar-ingest-key') chave: string | undefined, @Body() body: unknown): Promise<void> {
    this.autenticar(chave);
    const position = this.validar('posicao', body, validarPosicaoForward);
    await this.guardar('posicao', { position }, `traccar_device_id ${position.deviceId}, posição ${position.id}`);
  }

  @Post('events')
  @HttpCode(202)
  async events(@Headers('x-traccar-ingest-key') chave: string | undefined, @Body() body: unknown): Promise<void> {
    this.autenticar(chave);
    const event = this.validar('evento', body, validarEventoForward);
    await this.guardar('evento', { event }, `traccar_device_id ${event.deviceId}, evento ${event.id}`);
  }

  // Recusa por formato é descarte de dado (o Traccar reenvia e acaba desistindo): sempre loga o motivo e o
  // device, nunca o corpo. Agrupado por motivo para um aparelho a cada 10 s não inundar o log.
  private validar<T>(tipo: InboxTipo, body: unknown, validador: (b: unknown) => T): T {
    try {
      return validador(body);
    } catch (err) {
      if (!(err instanceof BadRequestException)) throw err;
      const motivo = err.message;
      const deviceId = (body as any)?.[tipo === 'posicao' ? 'position' : 'event']?.deviceId;
      const agora = Date.now();
      const r = this.recusas.get(motivo);
      if (!r || agora - r.ultimoAviso >= 60_000) {
        const extra = r?.suprimidas ? ` (+${r.suprimidas} recusas iguais no último minuto)` : '';
        this.logger.warn(`Forwarding recusado (400) — ${motivo} — traccar_device_id ${typeof deviceId === 'number' ? deviceId : '?'}${extra}`);
        this.recusas.set(motivo, { ultimoAviso: agora, suprimidas: 0 });
      } else r.suprimidas++;
      throw err;
    }
  }

  private autenticar(recebida: string | undefined) {
    const esperada = process.env.TRACCAR_INGEST_KEY;
    if (!esperada) {
      if (!this.avisouSemChave) {
        this.logger.warn('TRACCAR_INGEST_KEY não configurado — Forwarding do Traccar recusado (401)');
        this.avisouSemChave = true;
      }
      throw new UnauthorizedException();
    }
    // hash dos dois lados: timingSafeEqual exige o mesmo tamanho e a comparação não pode vazar o tamanho
    const hash = (v: string) => createHash('sha256').update(v).digest();
    if (typeof recebida !== 'string' || !timingSafeEqual(hash(recebida), hash(esperada))) {
      throw new UnauthorizedException();
    }
  }

  private async guardar(tipo: InboxTipo, payload: unknown, contexto: string) {
    try {
      await this.inbox.inserir(tipo, payload);
    } catch (err) {
      this.logger.error(`Inbox indisponível — ${tipo} recusada com 503 (${contexto}): ${(err as Error).message}`);
      throw new ServiceUnavailableException();
    }
  }
}
