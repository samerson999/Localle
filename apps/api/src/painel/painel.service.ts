import { Inject, Injectable, Logger } from '@nestjs/common';
import type IORedis from 'ioredis';
import { ContratosRepository } from '../contratos/contratos.repository';
import { FaturamentoService, hojeLocal } from '../contratos/faturamento.service';
import { FaturasRepository } from '../contratos/faturas.repository';
import { TraccarClient } from '../ingest/traccar-client';
import { MailService } from '../mail/mail.service';
import { REDIS_CONNECTION } from '../queue/redis.provider';
import { custoDoMes, DespesasRepository } from './despesas.repository';
import { PainelRepository } from './painel.repository';

type Situacao = 'ok' | 'degradado' | 'fora' | 'desligado';

/** Últimos `n` meses 'YYYY-MM', o último é `ym`. */
export function mesesAte(ym: string, n: number): string[] {
  const [y, m] = ym.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

@Injectable()
export class PainelService {
  private readonly logger = new Logger(PainelService.name);

  constructor(
    private readonly repo: PainelRepository,
    private readonly contratos: ContratosRepository,
    private readonly faturas: FaturasRepository,
    private readonly faturamento: FaturamentoService,
    private readonly traccar: TraccarClient,
    @Inject(REDIS_CONNECTION) private readonly redisConn: IORedis,
    private readonly mail: MailService,
    private readonly despesas: DespesasRepository,
  ) {}

  /**
   * Visão geral: tudo derivado de contratos, faturas e instalações reais. Meses fechados vêm das faturas
   * (o que foi faturado); o mês corrente é a apuração em aberto até hoje. Custo de cada mês pelas despesas vigentes nele
   * (cadastro em /superadmin/despesas); o do mês corrente usa os veículos de agora, os anteriores a média faturada.
   */
  async visaoGeral(hoje = hojeLocal()) {
    const ym = hoje.slice(0, 7);
    const meses = mesesAte(ym, 6);
    const [linhas, contratos, totais, comSaldo, vencendo, semSinal, aRecolher, despesas] = await Promise.all([
      this.faturamento.apuracao(ym, hoje),
      this.contratos.findAll(),
      this.faturas.totaisPorCompetencia(meses[0]),
      this.faturas.findComSaldo(),
      this.repo.contratosVencendo(60),
      this.repo.semSinal(24),
      this.repo.aRecolher(),
      this.despesas.listar(),
    ]);
    const tolerancia = new Map(contratos.map((c) => [c.clientId, c.versaoAtual.toleranceDays]));
    const porMes = new Map(totais.map((t) => [t.competencia, t]));
    const inadimplentes = comSaldo
      .map((f) => ({ f, s: this.faturamento.situacao(f, tolerancia.get(f.clientId) ?? 0, hoje) }))
      .filter(({ s }) => s.diasAtraso > 0)
      .map(({ f, s }) => ({ clientId: f.clientId, clientName: f.clientName, competencia: f.competencia, emAberto: s.emAberto, diasAtraso: s.diasAtraso, critico: s.critico }));

    const veiculosAgora = linhas.reduce((a, l) => a + l.veiculosAgora, 0);
    return {
      competencia: ym,
      contratosPorSituacao: contratos.reduce<Record<string, number>>((a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {}),
      veiculosAgora,
      custos: custoDoMes(despesas, ym, veiculosAgora),
      receitaPrevista: linhas.reduce((a, l) => a + l.previsto, 0),
      apuradoAteHoje: linhas.reduce((a, l) => a + l.apurado, 0),
      porTipoCobranca: linhas.reduce<Record<string, number>>((a, l) => ({ ...a, [l.billingType]: (a[l.billingType] ?? 0) + l.previsto }), {}),
      frotaPorCliente: linhas.map((l) => ({ clientName: l.clientName, veiculos: l.veiculosAgora })).sort((a, b) => b.veiculos - a.veiculos),
      historico: meses.map((m) =>
        m === ym
          ? { competencia: m, faturado: linhas.reduce((a, l) => a + l.apurado, 0), veiculos: linhas.reduce((a, l) => a + l.veiculosMedia, 0), fechado: false, custo: custoDoMes(despesas, m, veiculosAgora).total }
          : { competencia: m, faturado: porMes.get(m)?.total ?? 0, veiculos: porMes.get(m)?.veiculos ?? 0, fechado: porMes.has(m), custo: custoDoMes(despesas, m, Math.round(porMes.get(m)?.veiculos ?? 0)).total },
      ),
      inadimplentes,
      contratosVencendo: vencendo,
      rastreadoresSemSinal24h: semSinal,
      aRecolher,
    };
  }

  /** Saúde: cada fonte isolada — uma fora do ar não derruba a tela, vira `fora` com o motivo no log. */
  async saude() {
    const [banco, inbox, conciliacao, comunicacao, gateway, redis, smtp] = await Promise.all([
      this.repo.banco(),
      this.repo.inbox(),
      this.repo.conciliacao(),
      this.repo.comunicacao(),
      this.gateway(),
      this.redis(),
      this.mail.verify(),
    ]);
    // ligada/desligada é desta instância (variável de ambiente); a última volta vem do banco (qualquer instância)
    return {
      banco, inbox, conciliacao: { ligada: process.env.CONCILIACAO_ENABLED === 'true', ...conciliacao }, comunicacao, gateway, redis, smtp,
      verificadoEm: Date.now(),
    };
  }

  private async gateway(): Promise<{ status: Situacao; devices: number; online: number }> {
    const cfg = this.traccar.config();
    if (!cfg) return { status: 'desligado', devices: 0, online: 0 };
    try {
      const devices = await this.traccar.listDevices(cfg);
      return { status: 'ok', devices: devices.length, online: devices.filter((d) => d.status === 'online').length };
    } catch (err) {
      this.logger.warn(`saúde: Traccar ${cfg.url} não respondeu: ${(err as Error).message}`);
      return { status: 'fora', devices: 0, online: 0 };
    }
  }

  /**
   * Redis só carrega o tempo real do mapa (a fila de posições é o `ingest_inbox`, ver `inbox`): fora do ar, o mapa para de
   * atualizar sozinho, mas nenhuma posição se perde.
   */
  private async redis(): Promise<Situacao> {
    try {
      await Promise.race([
        this.redisConn.ping(),
        new Promise((_, falha) => setTimeout(() => falha(new Error('sem resposta em 3 s')), 3000)),
      ]);
      return 'ok';
    } catch (err) {
      this.logger.warn(`saúde: Redis (tempo real) não respondeu: ${(err as Error).message}`);
      return 'fora';
    }
  }
}
