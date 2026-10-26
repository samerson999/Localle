import { ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Comando } from '@localle/shared/realtime';
import type { Pool } from 'pg';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import { withTransaction } from '../db/with-transaction';
import { TraccarClient } from '../ingest/traccar-client';
import { RealtimeHub } from '../realtime/realtime.hub';
import { SettingsService } from '../settings/settings.service';
import { ComandosRepository, type ComandoRow, toComando } from './comandos.repository';
import { type ComandoInput, OPOSTO, TIPOS } from './dto/parse-comando';

const EXPIRACAO_MS = 60_000;

/**
 * Comandos ao rastreador via Traccar (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.4 e § 4.6). Regras de
 * segurança para comando que muda o estado físico (bloqueio/desbloqueio), decididas em 26/10/2026 a partir
 * dos pontos pendentes da § 4.6:
 * - autorização no envio: `comandos.bloquear` é checada pelo PermissionsGuard na requisição, não só na
 *   tela; o AuthGuard já recusa token de usuário desativado.
 * - condições que impedem o bloqueio: velocidade acima de `comandos.bloqueio_velocidade_max_kmh` ou última
 *   posição mais velha que `comandos.bloqueio_posicao_max_idade_min` (sem saber se está parado, não bloqueia).
 * - precedência: pedir o oposto cancela o pendente anterior (`cancelado`) antes de criar o novo — o mais
 *   recente vence. O cancelamento é só local (o Traccar não desenfileira), por isso o `commandResult` que
 *   chegar depois fica registrado como tardio em `resultado`, nunca silenciado.
 * - timeout ≠ cancelamento: `expirado` registra só que paramos de esperar.
 */
@Injectable()
export class ComandosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComandosService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly repo: ComandosRepository,
    private readonly traccar: TraccarClient,
    private readonly settings: SettingsService,
    private readonly audit: AuditLogRepository,
    private readonly realtime: RealtimeHub,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  onModuleInit(): void {
    if (process.env.COMANDOS_EXPIRER_ENABLED === 'false') return;
    this.timer = setInterval(() => void this.expirarVencidos(), EXPIRACAO_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  listar(clientId: string, assetId: string | null) {
    return this.repo.listar(clientId, assetId);
  }

  async solicitar(clientId: string, userId: string, input: ComandoInput): Promise<Comando> {
    const timeoutMin = await this.settings.resolve(clientId, 'comandos.timeout_min');
    const { comando, cancelados } = await withTransaction(this.pool, async (client) => {
      const vigente = await this.repo.rastreadorVigente(clientId, input.assetId, client);
      if (!vigente) throw new NotFoundException('Ativo sem rastreador principal instalado');
      if (!vigente.traccar_device_id) throw new ConflictException('Rastreador ainda não provisionado no Traccar');

      if (input.tipo === 'engineStop') await this.verificarCondicoesBloqueio(clientId, input.assetId, client);

      const cancelados: ComandoRow[] = [];
      const oposto = OPOSTO[input.tipo];
      if (oposto) {
        for (const pendente of await this.repo.pendentesPorRastreador(vigente.rastreador_id, [oposto], client)) {
          const c = await this.repo.transicionar(
            pendente.id,
            'cancelado',
            { resultado: { motivo: 'substituido_por_oposto' }, resolvido: true },
            undefined,
            client,
          );
          if (c) cancelados.push(c);
        }
      }

      let comando: ComandoRow;
      try {
        comando = await this.repo.criar(client, {
          clientId,
          assetId: input.assetId,
          rastreadorId: vigente.rastreador_id,
          tipo: input.tipo,
          motivo: input.motivo,
          solicitadoPor: userId,
          expiraEm: new Date(Date.now() + timeoutMin * 60_000),
        });
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw new ConflictException('Já há um comando igual pendente para este rastreador');
        throw err;
      }
      for (const c of cancelados) {
        await this.audit.record(
          { actorType: 'user', actorId: userId, clientId, action: 'comando.cancelar', target: c.id, after: { substituidoPor: comando.id } },
          client,
        );
      }
      await this.audit.record(
        {
          actorType: 'user',
          actorId: userId,
          clientId,
          action: 'comando.solicitar',
          target: comando.id,
          after: { tipo: input.tipo, assetId: input.assetId, motivo: input.motivo },
        },
        client,
      );
      return { comando, cancelados };
    });
    for (const c of cancelados) await this.publicar(c);
    this.logger.log(`Comando ${comando.id} (${comando.tipo}) solicitado por ${userId} — rastreador ${comando.rastreador_id}, client_id ${clientId}`);

    const enviado = await this.enviar(comando);
    await this.publicar(enviado);
    return toComando(enviado);
  }

  /** Envia ao Traccar fora da transação (chamada HTTP externa): falha vira `falhou`, nunca exceção para o usuário. */
  private async enviar(comando: ComandoRow): Promise<ComandoRow> {
    const config = this.traccar.config();
    if (!config) {
      this.logger.error(`Comando ${comando.id} não enviado: Traccar não configurado (TRACCAR_URL/USER/PASSWORD)`);
      return (await this.repo.transicionar(comando.id, 'falhou', { resultado: { erro: 'traccar_nao_configurado' }, resolvido: true })) ?? comando;
    }
    const { rows } = await this.pool.query<{ traccar_device_id: string }>('select traccar_device_id from rastreadores where id = $1', [
      comando.rastreador_id,
    ]);
    try {
      const r = await this.traccar.sendCommand(config, { deviceId: Number(rows[0].traccar_device_id), type: comando.tipo });
      const para = r.queued ? 'aguardando' : 'enviado';
      this.logger.log(`Comando ${comando.id} (${comando.tipo}) ${para} — traccar command ${r.id ?? '?'}`);
      return (await this.repo.transicionar(comando.id, para, { traccarCommandId: r.id, enviado: true })) ?? comando;
    } catch (err) {
      this.logger.error(`Comando ${comando.id} (${comando.tipo}) falhou no envio ao Traccar: ${(err as Error).message}`);
      return (await this.repo.transicionar(comando.id, 'falhou', { resultado: { erro: (err as Error).message }, resolvido: true })) ?? comando;
    }
  }

  private async verificarCondicoesBloqueio(clientId: string, assetId: string, client: Queryable) {
    const [velMax, idadeMax] = await Promise.all([
      this.settings.resolve(clientId, 'comandos.bloqueio_velocidade_max_kmh'),
      this.settings.resolve(clientId, 'comandos.bloqueio_posicao_max_idade_min'),
    ]);
    const p = await this.repo.posicaoAtual(clientId, assetId, client);
    if (!p) throw new ConflictException('Sem posição do veículo: não é possível saber se está parado para bloquear');
    const idadeMin = (Date.now() - p.fix_time.getTime()) / 60_000;
    if (idadeMin > idadeMax) {
      throw new ConflictException(`Última posição tem ${Math.round(idadeMin)} min (máximo ${idadeMax}): não bloqueia sem saber se está parado`);
    }
    const vel = p.speed_kmh === null ? 0 : Number(p.speed_kmh);
    if (vel > velMax) throw new ConflictException(`Veículo a ${Math.round(vel)} km/h: bloqueio só até ${velMax} km/h`);
  }

  /**
   * `commandResult` do Traccar (§ 1.4): confirma o pendente mais recente do rastreador — "o aparelho
   * confirmou segundo o protocolo dele", não prova de estado físico. Sem pendente, é execução tardia de um
   * comando já expirado/cancelado: fica em `resultado` e no log, nunca silenciado.
   */
  async receberResultado(traccarDeviceId: number, attributes: Record<string, unknown>, ts: Date): Promise<void> {
    const { rows } = await this.pool.query<{ id: string }>('select id from rastreadores where traccar_device_id = $1', [traccarDeviceId]);
    if (!rows[0]) {
      this.logger.warn(`commandResult descartado: traccar_device_id ${traccarDeviceId} não cadastrado`);
      return;
    }
    const rastreadorId = rows[0].id;
    // `attributes` vem do Forwarding sem validação de conteúdo: só o `result` entra, como string curta
    const result = attributes.result === undefined || attributes.result === null ? null : String(attributes.result).slice(0, 500);
    const resultado = { result, recebidoEm: ts.toISOString() };
    const [pendente] = await this.repo.pendentesPorRastreador(rastreadorId, TIPOS);
    if (pendente) {
      const c = await this.repo.transicionar(pendente.id, 'confirmado', { resultado, resolvido: true });
      if (c) {
        this.logger.log(`Comando ${c.id} (${c.tipo}) confirmado pelo aparelho — rastreador ${rastreadorId}`);
        await this.publicar(c);
      }
      return;
    }
    const tardio = await this.repo.ultimoResolvidoPorRastreador(rastreadorId);
    if (tardio) {
      await this.repo.anexarResultadoTardio(tardio.id, { tardio: true, ...resultado });
      this.logger.warn(
        `commandResult TARDIO para comando ${tardio.id} (${tardio.tipo}, ${tardio.status}) — rastreador ${rastreadorId}: executado após expiração/cancelamento local`,
      );
    } else {
      this.logger.warn(`commandResult sem comando correspondente — rastreador ${rastreadorId}: ${JSON.stringify(resultado)}`);
    }
  }

  async expirarVencidos(): Promise<number> {
    try {
      const expirados = await this.repo.expirarVencidos();
      for (const c of expirados) {
        this.logger.warn(`Comando ${c.id} (${c.tipo}) expirado sem commandResult — rastreador ${c.rastreador_id}, client_id ${c.client_id}`);
        await this.publicar(c);
      }
      return expirados.length;
    } catch (err) {
      this.logger.error(`Falha ao expirar comandos: ${(err as Error).message}`);
      return 0;
    }
  }

  private async publicar(c: ComandoRow) {
    try {
      await this.realtime.publish(c.client_id, { kind: 'comando_status', comando: toComando(c) });
    } catch (err) {
      this.logger.warn(`Status do comando ${c.id} não publicado (client_id ${c.client_id}): ${(err as Error).message}`);
    }
  }
}
