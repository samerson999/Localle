import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { RetencaoRepository } from './retencao.repository';

const DIA_MS = 86_400_000;
const PRIMEIRA_EXECUCAO_MS = 5 * 60_000;
/** Chaves do Setup (só da Locale) que parametrizam a rotina; ver settings/setting-definitions.ts. */
const KEY_EVENTOS_MINIMO = 'retencao.eventos_minimo_meses';
const KEY_SEM_CLIENTE = 'retencao.posicao_sem_cliente_meses';

export interface ResultadoRetencao {
  clientes: number;
  posicoes: number;
  eventos: number;
  posicoesSemCliente: number;
}

export function subtrairMeses(de: Date, meses: number): Date {
  const d = new Date(de);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d;
}

/**
 * Retenção por plano do cliente (docs/ARQUITETURA-BACKEND.md § 2.4, decisão de 23/10/2026): a policy nativa
 * do TimescaleDB vale para a hypertable inteira, então o que vence é apagado por `client_id`, lendo
 * `historico_meses` da versão vigente do contrato. Roda uma vez por dia; cliente sem contrato não é tocado
 * (fica no log para a Locale regularizar). Mínimo de eventos e prazo de posição sem cliente vêm do Setup
 * (chaves `retencao.*`, só da Locale). Export para Parquet (plano de 5 anos) ainda não existe — até lá,
 * nada é apagado antes de vencer o prazo contratado, só depois.
 */
@Injectable()
export class RetencaoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetencaoService.name);
  private timer?: NodeJS.Timeout;
  private primeira?: NodeJS.Timeout;

  constructor(
    private readonly repo: RetencaoRepository,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    if (process.env.RETENCAO_JOB_ENABLED === 'false') {
      this.logger.log('Rotina de retenção por plano desligada (RETENCAO_JOB_ENABLED=false)');
      return;
    }
    this.primeira = setTimeout(() => {
      void this.executar();
      this.timer = setInterval(() => void this.executar(), DIA_MS);
    }, PRIMEIRA_EXECUCAO_MS);
  }

  onModuleDestroy(): void {
    clearTimeout(this.primeira);
    clearInterval(this.timer);
  }

  async executar(agora = new Date()): Promise<ResultadoRetencao> {
    const inicio = Date.now();
    const resultado: ResultadoRetencao = { clientes: 0, posicoes: 0, eventos: 0, posicoesSemCliente: 0 };
    this.logger.log('Retenção por plano: início');
    try {
      const prazos = await this.repo.prazosPorCliente();
      for (const { clientId, historicoMeses } of prazos) {
        const eventosMinimo = await this.settings.resolve(clientId, KEY_EVENTOS_MINIMO);
        const posicoes = await this.repo.apagarPosicoes(clientId, subtrairMeses(agora, historicoMeses));
        const eventos = await this.repo.apagarEventos(clientId, subtrairMeses(agora, Math.max(historicoMeses, eventosMinimo)));
        resultado.clientes += 1;
        resultado.posicoes += posicoes;
        resultado.eventos += eventos;
        if (posicoes > 0 || eventos > 0) {
          this.logger.log(`Retenção client_id ${clientId} (${historicoMeses} meses): ${posicoes} posições e ${eventos} eventos apagados`);
        }
      }
      // posição sem cliente não tem tenant para resolver: vale o padrão da plataforma (resolvido por qualquer cliente; a chave é só da Locale)
      const semClienteMeses = prazos[0] ? await this.settings.resolve(prazos[0].clientId, KEY_SEM_CLIENTE) : 13;
      resultado.posicoesSemCliente = await this.repo.apagarPosicoesSemCliente(subtrairMeses(agora, semClienteMeses));
      const semContrato = await this.repo.clientesSemContrato();
      if (semContrato > 0) this.logger.warn(`Retenção: ${semContrato} cliente(s) sem contrato — histórico não apagado, regularizar o contrato`);
      this.logger.log(
        `Retenção por plano: fim em ${Date.now() - inicio} ms — ${resultado.clientes} clientes, ${resultado.posicoes} posições, ${resultado.eventos} eventos, ${resultado.posicoesSemCliente} posições sem cliente`,
      );
    } catch (err) {
      this.logger.error(`Retenção por plano falhou: ${(err as Error).message}`);
    }
    return resultado;
  }
}
