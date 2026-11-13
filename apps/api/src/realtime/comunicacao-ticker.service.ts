import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { RealtimeComunicacao } from '@localle/shared/realtime';
import { comunicacaoDaLinha } from '../monitoring/comunicacao-status';
import { MonitoringRepository } from '../monitoring/monitoring.repository';
import { SettingsService } from '../settings/settings.service';
import { ignicaoDosAtributos } from '../telemetria/leitura';
import { RealtimeHub } from './realtime.hub';

const TICK_MS = 60_000;

/**
 * "Sem sinal" é ausência de pacote: nada chega pela ingestão quando o aparelho cala, então a virada de status
 * precisa ser recalculada com o tempo (regra de comunicacao-status.ts, limite do cliente). A cada minuto, para
 * cada cliente com stream aberto NESTA instância, recalcula a comunicação da frota e entrega às conexões locais —
 * uma consulta por cliente por instância, qualquer que seja o número de abas abertas.
 */
@Injectable()
export class ComunicacaoTicker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComunicacaoTicker.name);
  private timer?: NodeJS.Timeout;
  private rodando = false;

  constructor(
    private readonly hub: RealtimeHub,
    private readonly repo: MonitoringRepository,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Público para o teste chamar sem timer. Uma volta lenta não se sobrepõe à seguinte. */
  async tick(agora = new Date()): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      for (const clientId of this.hub.clientesAssinados()) {
        try {
          this.hub.entregarLocal(clientId, await this.calcular(clientId, agora));
        } catch (err) {
          this.logger.warn(`Comunicação da frota não recalculada (client_id ${clientId}): ${(err as Error).message}`);
        }
      }
    } finally {
      this.rodando = false;
    }
  }

  async calcular(clientId: string, agora: Date): Promise<RealtimeComunicacao> {
    const [rows, semSinalH] = await Promise.all([
      this.repo.frotaAtual(clientId),
      this.settings.resolveMenorPorAtivo(clientId, 'monitoramento.sem_sinal_h'),
    ]);
    return {
      kind: 'comunicacao',
      ativos: rows.map((r) => {
        // pacote sem GPS não vira posição nem mensagem de tempo real: a ignição dele chega à tela por aqui
        const ignicao = ignicaoDosAtributos(r.ultimos_atributos);
        const em = r.atributos_vistos_em?.ignition;
        return {
          assetId: r.asset_id,
          comunicacao: comunicacaoDaLinha(r, semSinalH(r.asset_id), agora),
          fixTime: r.fix_time ? r.fix_time.toISOString() : null,
          ignicao,
          ignicaoEm: ignicao !== null && typeof em === 'string' ? em : null,
        };
      }),
    };
  }
}
