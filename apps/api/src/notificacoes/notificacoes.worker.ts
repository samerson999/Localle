import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { Pool } from 'pg';
import * as webpush from 'web-push';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Role } from '../auth/jwt';
import { PermissionsService } from '../permissions/permissions.service';
import { NotificacaoFilaRepository, NOTIFICACAO_FILA_MAX_TENTATIVAS, type FilaRow } from './notificacao-fila.repository';
import { validarEndpointPush } from './endpoint-push';
import { NotificacaoAparelhosRepository, NotificacaoPreferenciasRepository, type AparelhoRow } from './notificacoes.repository';
import { vapidConfig } from './vapid';

const LOTE = 50;
const POLL_MS = 2000;
const LIMPEZA_MS = 3600_000;

interface AlertaParaPush {
  id: string;
  asset_id: string | null;
  tipo: string;
  titulo: string;
  prioridade: 'alta' | 'media' | 'baixa';
}

/**
 * Resolve destinatários (quem vê o veículo + preferência do tipo) e entrega por `web-push`
 * (docs/PLANO-APK-TWA.md § 2). Mesmo protocolo de lease do `InboxWorker`. Sem chaves VAPID no ambiente
 * (dev local, HML sem configurar), o worker nem liga — a fila só se acumula até o canal existir.
 */
@Injectable()
export class NotificacoesWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificacoesWorker.name);
  private readonly workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  private timer?: NodeJS.Timeout;
  private limpeza?: NodeJS.Timeout;
  private parado = false;
  private cicloAtual?: Promise<void>;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly fila: NotificacaoFilaRepository,
    private readonly aparelhos: NotificacaoAparelhosRepository,
    private readonly preferencias: NotificacaoPreferenciasRepository,
    private readonly permissions: PermissionsService,
  ) {}

  onModuleInit(): void {
    const vapid = vapidConfig();
    if (!vapid) {
      this.logger.log('Worker de notificações push não ligado: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes neste ambiente');
      return;
    }
    if (process.env.NOTIFICACOES_WORKER_ENABLED === 'false') return;
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    this.logger.log(`Worker de notificações push ligado (${this.workerId})`);
    this.agendar(0);
    this.limpeza = setInterval(() => void this.limpar(), LIMPEZA_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.parado = true;
    if (this.timer) clearTimeout(this.timer);
    clearInterval(this.limpeza);
    await this.cicloAtual;
  }

  /** Processa um lote e devolve quantas linhas reivindicou. Público para teste chamar sem timer. */
  async processarLote(limite = LOTE): Promise<number> {
    const linhas = await this.fila.reivindicar(this.workerId, limite);
    for (const linha of linhas) {
      try {
        await this.processar(linha);
        await this.fila.concluir(linha.id);
      } catch (err) {
        const msg = (err as Error).message;
        if (linha.tentativas >= NOTIFICACAO_FILA_MAX_TENTATIVAS) {
          this.logger.error(`Notificação do alerta ${linha.alerta_id} esgotou tentativas: ${msg}`);
        } else {
          this.logger.warn(`Notificação do alerta ${linha.alerta_id} falhou na tentativa ${linha.tentativas}: ${msg}`);
        }
        await this.fila.falhar(linha.id, msg);
      }
    }
    return linhas.length;
  }

  private async processar(linha: FilaRow): Promise<void> {
    const alerta = await this.buscarAlerta(linha.client_id, linha.alerta_id);
    if (!alerta) return; // alerta apagado por algum motivo: nada a notificar

    const destinatarios = await this.resolverDestinatarios(linha.client_id, alerta);
    if (destinatarios.length === 0) return;

    const payload = JSON.stringify({
      alertaId: alerta.id,
      assetId: alerta.asset_id,
      tipo: alerta.tipo,
      titulo: alerta.titulo,
      prioridade: alerta.prioridade,
    });

    for (const aparelho of destinatarios) {
      await this.enviar(aparelho, payload, alerta.prioridade === 'alta');
    }
  }

  private async buscarAlerta(clientId: string, alertaId: string): Promise<AlertaParaPush | null> {
    const { rows } = await this.pool.query<AlertaParaPush>(
      `select id, asset_id, tipo, titulo, prioridade from alertas where client_id = $1 and id = $2`,
      [clientId, alertaId],
    );
    return rows[0] ?? null;
  }

  /**
   * "Quem tem permissão de ver o veículo" (docs/PLANO-APK-TWA.md § 2) — hoje a visibilidade de ativo é por
   * papel, não por usuário/veículo individual (não há tabela de visibilidade granular no domínio ainda);
   * por isso o critério real é: usuário ativo do cliente cujo papel tem `monitoramento.ver`, e que não
   * desligou este tipo de alerta nas preferências (ausência de preferência = padrão só prioridade alta).
   */
  private async resolverDestinatarios(clientId: string, alerta: AlertaParaPush): Promise<AparelhoRow[]> {
    const { rows: usuarios } = await this.pool.query<{ id: string; role: Role }>(
      `select id, role from users where client_id = $1 and desativado_em is null`,
      [clientId],
    );
    const idsComAcesso: string[] = [];
    for (const u of usuarios) {
      if (!(await this.permissions.isAllowed(clientId, u.role, 'monitoramento.ver'))) continue;
      const prefs = await this.preferencias.listar(clientId, u.id);
      const pref = prefs.find((p) => p.tipo === alerta.tipo);
      const ativo = pref ? pref.ativo : alerta.prioridade === 'alta';
      if (ativo) idsComAcesso.push(u.id);
    }
    return this.aparelhos.listarDoCliente(clientId, idsComAcesso);
  }

  private async enviar(aparelho: AparelhoRow, payload: string, prioridadeAlta: boolean): Promise<void> {
    // 3ª camada (controller e repository.registrar já recusam na entrada): cobre linha gravada antes
    // desta correção — nunca envia para um host fora da allowlist, mesmo que já esteja no banco.
    if (validarEndpointPush(aparelho.endpoint)) {
      // nunca logar o endpoint em si (docs/PLANO-APK-TWA.md § 2 / .claude/rules/observability.md)
      this.logger.warn(`Aparelho ${aparelho.id} removido: endpoint fora da allowlist de push`);
      await this.aparelhos.apagarPorEndpoint(aparelho.endpoint);
      return;
    }
    try {
      await webpush.sendNotification(
        { endpoint: aparelho.endpoint, keys: { p256dh: aparelho.p256dh ?? '', auth: aparelho.auth ?? '' } },
        payload,
        { urgency: prioridadeAlta ? 'high' : 'normal' },
      );
      await this.aparelhos.registrarEnvio(aparelho.endpoint);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.aparelhos.apagarPorEndpoint(aparelho.endpoint);
        this.logger.warn(`Aparelho ${aparelho.id} removido: endpoint respondeu ${status}`);
        return;
      }
      await this.aparelhos.registrarFalha(aparelho.endpoint);
      throw err;
    }
  }

  private agendar(ms: number) {
    if (this.parado) return;
    this.timer = setTimeout(() => {
      this.cicloAtual = this.ciclo();
    }, ms);
  }

  private async ciclo(): Promise<void> {
    let reivindicadas = 0;
    try {
      reivindicadas = await this.processarLote();
    } catch (err) {
      this.logger.error(`Falha ao ler a fila de notificações: ${(err as Error).message}`);
    }
    this.agendar(reivindicadas >= LOTE ? 0 : POLL_MS);
  }

  private async limpar(): Promise<void> {
    try {
      const removidas = await this.fila.limparProcessados();
      if (removidas > 0) this.logger.log(`Fila de notificações: ${removidas} linhas processadas há mais de 3 dias removidas`);
    } catch (err) {
      this.logger.error(`Falha na limpeza da fila de notificações: ${(err as Error).message}`);
    }
  }
}
