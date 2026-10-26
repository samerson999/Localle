import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { apurar, daysLate, dueDateOf, estimar, type BillingType, type ContractStatus } from '@localle/shared/contratos';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { ContratosRepository, TZ_COMPETENCIA } from './contratos.repository';
import { FaturasRepository, type FaturaRow } from './faturas.repository';

export interface LinhaFaturamento {
  clientId: string;
  clientName: string;
  contratoStatus: ContractStatus;
  billingType: BillingType;
  /** Média de veículos-dia da competência (fechada: a gravada; aberta: medida agora). */
  veiculosMedia: number;
  veiculosAgora: number;
  previsto: number;
  apurado: number;
  /** null = competência ainda não fechada para este cliente. */
  fatura: { id: string; vencimento: string; pago: number; emAberto: number; diasAtraso: number; critico: boolean } | null;
}

/** Data de hoje no fuso das competências, 'YYYY-MM-DD'. */
export function hojeLocal(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ_COMPETENCIA }).format(now);
}

const FORMAS = ['pix', 'boleto', 'cartao', 'transferencia'];

@Injectable()
export class FaturamentoService {
  private readonly logger = new Logger(FaturamentoService.name);

  constructor(
    private readonly contratos: ContratosRepository,
    private readonly faturas: FaturasRepository,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * Apuração de uma competência para todos os clientes com contrato. Competência fechada usa o que foi
   * gravado (valores e medição preservados); aberta recalcula com a versão vigente e a medição de agora.
   */
  async apuracao(ym: string, hoje = hojeLocal()): Promise<LinhaFaturamento[]> {
    const [contratos, fechadas, medicao, agora] = await Promise.all([
      this.contratos.findAll(),
      this.faturas.findByCompetencia(ym),
      this.contratos.medicaoDiaria(ym),
      this.contratos.veiculosAgora(),
    ]);
    const porCliente = new Map(fechadas.map((f) => [f.clientId, f]));
    return contratos.map((c) => {
      const v = c.versaoAtual;
      const veiculosAgora = agora.get(c.clientId) ?? 0;
      const f = porCliente.get(c.clientId);
      const aberto = apurar(v, medicao.get(c.clientId) ?? [], ym);
      return {
        clientId: c.clientId,
        clientName: c.clientName,
        contratoStatus: c.status,
        billingType: v.billingType,
        veiculosMedia: f ? f.veiculosMedia : aberto.avgVehicles,
        veiculosAgora,
        previsto: estimar(v, veiculosAgora),
        apurado: f ? f.valorTotal : aberto.total,
        fatura: f ? this.situacao(f, v.toleranceDays, hoje) : null,
      };
    });
  }

  situacao(f: FaturaRow, toleranceDays: number, hoje: string) {
    const emAberto = Math.max(0, Math.round((f.valorTotal - f.pago) * 100) / 100);
    const diasAtraso = emAberto > 0 ? daysLate(f.vencimento, hoje) : 0;
    return { id: f.id, vencimento: f.vencimento, pago: f.pago, emAberto, diasAtraso, critico: diasAtraso > toleranceDays };
  }

  /**
   * Fecha a competência: grava uma fatura por cliente com contrato (exceto cancelado e os já fechados),
   * com a versão vigente e a medição de veículos-dia. Só competência encerrada — o mês corrente ainda muda.
   */
  async fechar(
    superadminId: string,
    ym: string,
    opts: { clientId?: string; hoje?: string } = {},
  ): Promise<{ fechadas: number; jaFechadas: number }> {
    const hoje = opts.hoje ?? hojeLocal();
    if (ym >= hoje.slice(0, 7)) throw new BadRequestException('Só é possível fechar competência de mês já encerrado');
    const contratos = (await this.contratos.findAll()).filter(
      (c) => c.status !== 'cancelado' && (!opts.clientId || c.clientId === opts.clientId),
    );
    if (opts.clientId && !contratos.length) throw new NotFoundException('Cliente sem contrato faturável');
    const resultado = await withTransaction(this.pool, async (tx) => {
      const medicao = await this.contratos.medicaoDiaria(ym, tx);
      let fechadas = 0;
      for (const c of contratos) {
        const v = c.versaoAtual;
        const r = apurar(v, medicao.get(c.clientId) ?? [], ym);
        const id = await this.faturas.insert(
          {
            clientId: c.clientId,
            competencia: ym,
            contratoVersaoId: v.id,
            veiculosMedia: r.avgVehicles,
            valorBase: r.base,
            valorExcedente: r.extra,
            valorTotal: r.total,
            vencimento: dueDateOf(ym, v.dueDay),
            fechadaPor: superadminId,
          },
          tx,
        );
        if (!id) continue;
        fechadas++;
        await this.audit.record(
          { actorType: 'superadmin', actorId: superadminId, clientId: c.clientId, action: 'fatura.fechar', target: id, after: { competencia: ym, total: r.total } },
          tx,
        );
      }
      return { fechadas, jaFechadas: contratos.length - fechadas };
    });
    this.logger.log(`competência ${ym} fechada por superadmin=${superadminId}: ${resultado.fechadas} faturas novas, ${resultado.jaFechadas} já fechadas`);
    return resultado;
  }

  async registrarPagamento(
    superadminId: string,
    faturaId: string,
    p: { valor: number; pagoEm: string; forma: string; observacao: string | null },
  ) {
    if (!FORMAS.includes(p.forma)) throw new BadRequestException('"forma" inválida');
    // em centavos exatos: a coluna é numeric(12,2) e arredondaria em silêncio (0,001 virava 0 → 500; 10,009 → 10,01)
    if (!Number.isFinite(p.valor) || p.valor <= 0 || p.valor > 10_000_000 || Math.abs(p.valor * 100 - Math.round(p.valor * 100)) > 1e-6) {
      throw new BadRequestException('"valor" precisa ser maior que zero, com no máximo 2 casas decimais');
    }
    return withTransaction(this.pool, async (tx) => {
      // trava a fatura: dois registros simultâneos não passam juntos do saldo
      await tx.query('select id from faturas where id = $1 for update', [faturaId]);
      const f = await this.faturas.findById(faturaId, tx);
      if (!f) throw new NotFoundException('Fatura não encontrada');
      const saldo = Math.round((f.valorTotal - f.pago) * 100) / 100;
      if (p.valor > saldo) throw new BadRequestException(`Valor maior que o saldo em aberto (${saldo.toFixed(2)})`);
      const id = await this.faturas.insertPagamento({ faturaId, clientId: f.clientId, registradoPor: superadminId, ...p }, tx);
      await this.audit.record(
        { actorType: 'superadmin', actorId: superadminId, clientId: f.clientId, action: 'pagamento.registrar', target: faturaId, after: p },
        tx,
      );
      return { id, saldo: Math.round((saldo - p.valor) * 100) / 100 };
    });
  }
}
