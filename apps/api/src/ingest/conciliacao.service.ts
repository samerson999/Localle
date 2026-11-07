import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { validarPosicaoForward } from './dto/traccar-forward.dto';
import { diasControleDuplicidade } from './inbox.repository';
import { ConciliacaoRepository, type RastreadorConciliavel, type TotaisExecucao } from './conciliacao.repository';
import { readTraccarConfig, TraccarClient, type TraccarConfig } from './traccar-client';
import type { TraccarPositionPayload } from './traccar-position.mapper';

const num = (v: string | undefined, padrao: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : padrao);

/** Parâmetros por ambiente (`.env.example`). Lidos na hora, para o teste conseguir trocar. */
export function parametrosConciliacao() {
  return {
    intervaloMs: num(process.env.CONCILIACAO_INTERVALO_MS, 300_000),
    /** Só confere o que tem mais que isto de idade: dá tempo ao Forwarding (e ao retry dele) de entregar primeiro. */
    atrasoMs: num(process.env.CONCILIACAO_ATRASO_S, 120) * 1000,
    /** Cada janela recomeça este tanto antes do checkpoint: cobre relógio de aparelho e posição que chegou um pouco atrasada. */
    sobreposicaoMs: num(process.env.CONCILIACAO_SOBREPOSICAO_S, 600) * 1000,
    /** Maior janela por consulta ao Traccar: recuperação longa vira várias consultas pequenas, cada uma com seu checkpoint. */
    janelaMaxMs: num(process.env.CONCILIACAO_JANELA_MAX_H, 6) * 3600_000,
    /** Rastreador sem checkpoint começa a ser conferido a partir de agora menos isto. */
    inicioMs: num(process.env.CONCILIACAO_INICIO_H, 24) * 3600_000,
    /** Freio: com mais recuperadas que isto esperando no inbox, a volta para (o consumidor está atrás). */
    maxPendentes: num(process.env.CONCILIACAO_MAX_PENDENTES, 5000),
    /** Pausa entre consultas ao Traccar, para a recuperação não competir com o painel e o Forwarding dele. */
    pausaMs: num(process.env.CONCILIACAO_PAUSA_MS, 100),
    timeoutMs: num(process.env.CONCILIACAO_TIMEOUT_MS, 30_000),
  };
}

export interface ResultadoConciliacao extends TotaisExecucao {
  execucaoId: string;
  interrompidaPor: string | null;
}

/** Um dia de folga sobre o controle de duplicidade: a limpeza é por hora de recebimento, a janela é por fixTime. */
const limiteDoControle = (agora: Date) => new Date(agora.getTime() - (diasControleDuplicidade() - 1) * 86_400_000);

const zerados = (): TotaisExecucao => ({
  rastreadores: 0, consultasTraccar: 0, verificadas: 0, jaRecebidas: 0, jaNoInbox: 0, recuperadas: 0, rejeitadas: 0, falhas: 0,
});

/**
 * Conciliação com o Traccar (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.6 e § 6a). O Forwarding é o caminho rápido, mas o
 * retry dele vive na memória do Traccar e tem teto: API fora por 2 min perdeu 95 de 120 posições num teste com o Traccar
 * 6.17.0. Esta rotina busca no Traccar, por rastreador e janela de fixTime, as posições que a plataforma não tem e as põe
 * no `ingest_inbox` (prioridade 1) — o resto do caminho (dedup, gravação, `ultima_posicao` só para frente) é o mesmo do
 * Forwarding.
 *
 * Fonte: API REST (`GET /api/positions?deviceId&from&to`), não SQL em `tc_positions` — decisão de 05/11/2026: na HML o
 * banco do Traccar guarda hora local do container sem fuso (America/Recife), e o REST devolve ISO com fuso no mesmo
 * formato do Forwarding (mesmo validador). Limitação aceita: o REST filtra por fixTime, então uma posição com fixTime
 * anterior a uma janela já conferida (atraso maior que a sobreposição) só é recuperada por reexecução manual.
 *
 * Desligada por padrão (`CONCILIACAO_ENABLED=true` liga). Uma volta por vez por processo; entre processos, o checkpoint
 * condicional do repository impede que dois avancem o mesmo rastreador.
 */
@Injectable()
export class ConciliacaoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConciliacaoService.name);
  private timer?: NodeJS.Timeout;
  private parado = false;
  private rodando = false;
  private voltaAtual: Promise<unknown> | null = null;

  constructor(
    private readonly repo: ConciliacaoRepository,
    private readonly traccar: TraccarClient,
  ) {}

  onModuleInit(): void {
    if (process.env.CONCILIACAO_ENABLED !== 'true') {
      this.logger.log('Conciliação com o Traccar desligada (CONCILIACAO_ENABLED != true).');
      return;
    }
    if (!readTraccarConfig()) {
      this.logger.warn('CONCILIACAO_ENABLED=true mas TRACCAR_URL/USER/PASSWORD não configurados — conciliação desligada.');
      return;
    }
    const p = parametrosConciliacao();
    this.logger.log(
      `Conciliação com o Traccar ligada: a cada ${p.intervaloMs / 1000}s, atraso ${p.atrasoMs / 1000}s, sobreposição ${p.sobreposicaoMs / 1000}s, janela máx. ${p.janelaMaxMs / 3600_000}h`,
    );
    this.agendar(p.atrasoMs);
  }

  /** A volta em andamento para entre rastreadores/janelas (cada janela já commitada fica); o desligamento espera por ela. */
  async onModuleDestroy(): Promise<void> {
    this.parado = true;
    clearTimeout(this.timer);
    await this.voltaAtual;
  }

  private agendar(ms: number) {
    if (this.parado) return;
    this.timer = setTimeout(async () => {
      try {
        this.voltaAtual = this.conciliar();
        await this.voltaAtual;
      } catch (err) {
        this.logger.error(`Volta de conciliação falhou: ${(err as Error).message}`);
      }
      this.voltaAtual = null;
      this.agendar(parametrosConciliacao().intervaloMs);
    }, ms);
  }

  /**
   * Volta automática sobre os rastreadores, avançando os checkpoints. Público para o teste chamar sem timer; `alvo`
   * restringe a um rastreador (o teste não pode mexer nos checkpoints dos demais do banco local).
   */
  async conciliar(agora = new Date(), alvo?: { rastreadorId: string }): Promise<ResultadoConciliacao | null> {
    const config = readTraccarConfig();
    if (!config || this.rodando) return null;
    this.rodando = true;
    try {
      const p = parametrosConciliacao();
      const execucaoId = await this.repo.iniciarExecucao('automatica', { ...p });
      const t = zerados();
      let interrompidaPor: string | null = null;

      // lastUpdate de todos os devices numa consulta: device que não falou desde o começo da janela não tem posição nela
      let ultimoPacote: Map<number, number | null>;
      try {
        const devices = await this.traccar.listDevices(config, p.timeoutMs);
        ultimoPacote = new Map(devices.map((d) => [d.id, d.lastUpdate ? Date.parse(d.lastUpdate) : null]));
        t.consultasTraccar++;
      } catch (err) {
        t.falhas++;
        this.logger.error(`Conciliação: Traccar não respondeu a lista de devices — volta adiada: ${(err as Error).message}`);
        await this.repo.concluirExecucao(execucaoId, t, 'traccar_indisponivel');
        return { execucaoId, ...t, interrompidaPor: 'traccar_indisponivel' };
      }

      const fimDasJanelas = new Date(agora.getTime() - p.atrasoMs);
      for (const r of await this.repo.rastreadores(alvo)) {
        if (this.parado) {
          interrompidaPor = 'desligamento';
          break;
        }
        if (await this.freioAcionado(p.maxPendentes)) {
          interrompidaPor = 'freio';
          break;
        }
        t.rastreadores++;
        try {
          await this.alcancar(config, r, fimDasJanelas, agora, ultimoPacote, t, p);
        } catch (err) {
          t.falhas++;
          this.logger.warn(
            `Conciliação: rastreador_id=${r.rastreadorId} traccar_device_id=${r.traccarDeviceId} falhou (checkpoint mantido em ${r.conciliadoAte?.toISOString() ?? '-'}): ${(err as Error).message}`,
          );
        }
      }

      await this.repo.concluirExecucao(execucaoId, t, interrompidaPor);
      this.resumir('automática', execucaoId, t, interrompidaPor);
      return { execucaoId, ...t, interrompidaPor };
    } finally {
      this.rodando = false;
    }
  }

  /** Leva o checkpoint de um rastreador até `fim`, em janelas de no máximo `janelaMaxMs`, cada uma com seu commit. */
  private async alcancar(
    config: TraccarConfig,
    r: RastreadorConciliavel,
    fim: Date,
    agora: Date,
    ultimoPacote: Map<number, number | null>,
    t: TotaisExecucao,
    p: ReturnType<typeof parametrosConciliacao>,
  ) {
    if (!ultimoPacote.has(r.traccarDeviceId)) {
      throw new Error('device não aparece na lista do Traccar (apagado, ou invisível ao usuário da API)');
    }
    let base = r.conciliadoAte ?? new Date(agora.getTime() - p.inicioMs);
    // mais velho que o controle de duplicidade (API fora por semanas): conferir regravaria posições já gravadas
    const limite = limiteDoControle(agora);
    if (base < limite) {
      this.logger.warn(
        `Conciliação: rastreador_id=${r.rastreadorId} checkpoint ${base.toISOString()} mais velho que o controle de duplicidade (${diasControleDuplicidade()} dias) — conferindo só a partir de ${limite.toISOString()}`,
      );
    }
    // sobreposição só ao retomar de um checkpoint gravado (e nunca para antes do limite acima); entre janelas da mesma volta
    // a anterior acabou de ser conferida
    let sobreposicao = r.conciliadoAte && base > limite ? p.sobreposicaoMs : 0;
    if (base < limite) base = limite;
    while (base < fim && !this.parado) {
      const de = new Date(base.getTime() - sobreposicao);
      sobreposicao = 0;
      const ate = new Date(Math.min(base.getTime() + p.janelaMaxMs, fim.getTime()));
      const visto = ultimoPacote.get(r.traccarDeviceId);
      // sem pacote desde antes do começo da janela: nada a buscar, o checkpoint avança sem consultar o Traccar
      const posicoes = visto !== null && visto !== undefined && visto >= de.getTime() ? await this.buscar(config, r, de, ate, t, p) : [];
      const res = await this.repo.gravarJanela(r, posicoes, { esperado: r.conciliadoAte, novo: ate });
      if (res.conflito) {
        this.logger.log(`Conciliação: rastreador_id=${r.rastreadorId} conciliado por outra instância no meio — segue na próxima volta`);
        return;
      }
      this.somar(t, res);
      this.avisarRecuperadas(r, res.recuperadas, de, ate, 'automática');
      r.conciliadoAte = ate;
      base = ate;
    }
  }

  /**
   * Reexecução manual de um rastreador num período (rota de superadmin): confere tudo de novo, sem olhar nem mexer no
   * checkpoint, e enfileira o que faltar — o dedup torna a repetição inofensiva.
   */
  async reexecutar(alvo: { rastreadorId?: string; traccarDeviceId?: number }, de: Date, ate: Date): Promise<ResultadoConciliacao> {
    const config = readTraccarConfig();
    if (!config) throw new BadRequestException('Traccar não configurado nesta API');
    const limite = limiteDoControle(new Date());
    if (de < limite) {
      throw new BadRequestException(
        `Período começa antes de ${limite.toISOString()}: o controle de duplicidade guarda ${diasControleDuplicidade()} dias, e posição mais velha poderia ser gravada duas vezes`,
      );
    }
    const [r] = await this.repo.rastreadores(alvo);
    if (!r) throw new NotFoundException('Rastreador não encontrado ou sem device no Traccar');
    const p = parametrosConciliacao();
    const execucaoId = await this.repo.iniciarExecucao('manual', { rastreadorId: r.rastreadorId, traccarDeviceId: r.traccarDeviceId, de, ate });
    const t = zerados();
    t.rastreadores = 1;
    let interrompidaPor: string | null = null;
    try {
      for (let base = de; base < ate; ) {
        if (await this.freioAcionado(p.maxPendentes)) {
          interrompidaPor = 'freio';
          break;
        }
        const fimJanela = new Date(Math.min(base.getTime() + p.janelaMaxMs, ate.getTime()));
        const posicoes = await this.buscar(config, r, base, fimJanela, t, p);
        const res = await this.repo.gravarJanela(r, posicoes, null);
        this.somar(t, res);
        this.avisarRecuperadas(r, res.recuperadas, base, fimJanela, 'manual');
        base = fimJanela;
      }
    } catch (err) {
      t.falhas++;
      interrompidaPor = 'erro';
      this.logger.warn(`Conciliação manual: rastreador_id=${r.rastreadorId} traccar_device_id=${r.traccarDeviceId} falhou: ${(err as Error).message}`);
    }
    await this.repo.concluirExecucao(execucaoId, t, interrompidaPor);
    this.resumir('manual', execucaoId, t, interrompidaPor);
    return { execucaoId, ...t, interrompidaPor };
  }

  situacao() {
    return this.repo.situacao();
  }

  /** Consulta o Traccar e separa o que passa no mesmo validador do Forwarding; o resto é contado e logado como recusa. */
  private async buscar(
    config: TraccarConfig,
    r: RastreadorConciliavel,
    de: Date,
    ate: Date,
    t: TotaisExecucao,
    p: ReturnType<typeof parametrosConciliacao>,
  ): Promise<TraccarPositionPayload[]> {
    const brutas = await this.traccar.positionsBetween(config, r.traccarDeviceId, de, ate, p.timeoutMs);
    t.consultasTraccar++;
    t.verificadas += brutas.length;
    const validas: TraccarPositionPayload[] = [];
    const motivos = new Map<string, number[]>();
    for (const bruta of brutas) {
      try {
        const v = validarPosicaoForward({ position: bruta });
        if (v.deviceId !== r.traccarDeviceId) throw new BadRequestException(`deviceId=${v.deviceId} de outro aparelho`);
        validas.push(v);
      } catch (err) {
        t.rejeitadas++;
        const lista = motivos.get((err as Error).message) ?? [];
        lista.push(bruta?.id);
        motivos.set((err as Error).message, lista);
      }
    }
    for (const [motivo, ids] of motivos) {
      this.logger.warn(
        `Conciliação: ${ids.length} posição(ões) do Traccar recusada(s) — ${motivo} — traccar_device_id=${r.traccarDeviceId}, ids ${ids.slice(0, 10).join(', ')}${ids.length > 10 ? '…' : ''}`,
      );
    }
    if (p.pausaMs > 0) await new Promise((res) => setTimeout(res, p.pausaMs));
    return validas;
  }

  private async freioAcionado(max: number): Promise<boolean> {
    const pendentes = await this.repo.pendentesRecuperadas();
    if (pendentes < max) return false;
    this.logger.warn(`Conciliação pausada: ${pendentes} posições recuperadas esperando no inbox (limite ${max}) — checkpoints mantidos, retoma na próxima volta`);
    return true;
  }

  private somar(t: TotaisExecucao, res: { jaRecebidas: number; jaNoInbox: number; recuperadas: number }) {
    t.jaRecebidas += res.jaRecebidas;
    t.jaNoInbox += res.jaNoInbox;
    t.recuperadas += res.recuperadas;
  }

  // posição recuperada = o Forwarding perdeu: é o sinal operacional que importa, um aviso por rastreador e janela
  private avisarRecuperadas(r: RastreadorConciliavel, n: number, de: Date, ate: Date, modo: string) {
    if (!n) return;
    this.logger.warn(
      `Conciliação ${modo}: ${n} posição(ões) que o Forwarding não entregou recuperada(s) — rastreador_id=${r.rastreadorId} traccar_device_id=${r.traccarDeviceId}, fixTime ${de.toISOString()} → ${ate.toISOString()}`,
    );
  }

  private resumir(modo: string, execucaoId: string, t: TotaisExecucao, interrompidaPor: string | null) {
    if (!t.recuperadas && !t.rejeitadas && !t.falhas && !interrompidaPor) return; // volta sem novidade não vira log
    this.logger.log(
      `Conciliação ${modo} #${execucaoId}: ${t.rastreadores} rastreador(es), ${t.consultasTraccar} consulta(s) ao Traccar, ${t.verificadas} verificadas, ` +
        `${t.jaRecebidas} já gravadas, ${t.jaNoInbox} já no inbox, ${t.recuperadas} recuperadas, ${t.rejeitadas} recusadas, ${t.falhas} falha(s)` +
        (interrompidaPor ? `, interrompida: ${interrompidaPor}` : ''),
    );
  }
}

