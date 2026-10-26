import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';

export interface FaturaRow {
  id: string;
  clientId: string;
  clientName: string;
  competencia: string; // YYYY-MM
  contratoVersaoId: string;
  veiculosMedia: number;
  valorBase: number;
  valorExcedente: number;
  valorTotal: number;
  vencimento: string; // YYYY-MM-DD
  pago: number;
  fechadaEm: number;
}

export interface PagamentoRow {
  id: string;
  valor: number;
  pagoEm: string;
  forma: 'pix' | 'boleto' | 'cartao' | 'transferencia';
  observacao: string | null;
  registradoEm: number;
}

const SELECT_FATURA = `select f.id, f.client_id, cl.name as client_name, to_char(f.competencia, 'YYYY-MM') as competencia,
    f.contrato_versao_id, f.veiculos_media, f.valor_base, f.valor_excedente, f.valor_total,
    to_char(f.vencimento, 'YYYY-MM-DD') as vencimento, f.fechada_em,
    coalesce((select sum(p.valor) from pagamentos p where p.fatura_id = f.id), 0) as pago
  from faturas f join clients cl on cl.id = f.client_id`;

const toFatura = (r: any): FaturaRow => ({
  id: r.id,
  clientId: r.client_id,
  clientName: r.client_name,
  competencia: r.competencia,
  contratoVersaoId: r.contrato_versao_id,
  veiculosMedia: Number(r.veiculos_media),
  valorBase: Number(r.valor_base),
  valorExcedente: Number(r.valor_excedente),
  valorTotal: Number(r.valor_total),
  vencimento: r.vencimento,
  pago: Number(r.pago),
  fechadaEm: new Date(r.fechada_em).getTime(),
});

/** Faturamento da Locale aos clientes: camada administrativa, cruza clientes (rotas só de superadmin). */
@Injectable()
export class FaturasRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByCompetencia(ym: string): Promise<FaturaRow[]> {
    const { rows } = await this.pool.query(`${SELECT_FATURA} where f.competencia = ($1 || '-01')::date`, [ym]);
    return rows.map(toFatura);
  }

  async findById(id: string, executor: Queryable = this.pool): Promise<FaturaRow | null> {
    const { rows } = await executor.query(`${SELECT_FATURA} where f.id = $1`, [id]);
    return rows[0] ? toFatura(rows[0]) : null;
  }

  /** Faturas fechadas com saldo — base de "inadimplentes" (o vencimento decide se já é atraso). */
  async findComSaldo(): Promise<FaturaRow[]> {
    const { rows } = await this.pool.query(
      `select * from (${SELECT_FATURA}) x where x.valor_total > x.pago order by x.vencimento`,
    );
    return rows.map(toFatura);
  }

  /** Total faturado e veículos-dia por competência (histórico da Visão geral). */
  async totaisPorCompetencia(desde: string): Promise<{ competencia: string; total: number; veiculos: number }[]> {
    const { rows } = await this.pool.query(
      `select to_char(competencia, 'YYYY-MM') as competencia, sum(valor_total) as total, sum(veiculos_media) as veiculos
         from faturas where competencia >= ($1 || '-01')::date group by competencia order by competencia`,
      [desde],
    );
    return rows.map((r) => ({ competencia: r.competencia, total: Number(r.total), veiculos: Number(r.veiculos) }));
  }

  /** `on conflict do nothing`: fechar duas vezes a mesma competência não duplica nem sobrescreve. */
  async insert(
    f: { clientId: string; competencia: string; contratoVersaoId: string; veiculosMedia: number; valorBase: number; valorExcedente: number; valorTotal: number; vencimento: string; fechadaPor: string },
    executor: Queryable,
  ): Promise<string | null> {
    const { rows } = await executor.query<{ id: string }>(
      `insert into faturas (client_id, competencia, contrato_versao_id, veiculos_media, valor_base, valor_excedente, valor_total, vencimento, fechada_por)
       values ($1, ($2 || '-01')::date, $3, $4, $5, $6, $7, $8, $9)
       on conflict (client_id, competencia) do nothing returning id`,
      [f.clientId, f.competencia, f.contratoVersaoId, f.veiculosMedia, f.valorBase, f.valorExcedente, f.valorTotal, f.vencimento, f.fechadaPor],
    );
    return rows[0]?.id ?? null;
  }

  async insertPagamento(
    p: { faturaId: string; clientId: string; valor: number; pagoEm: string; forma: string; observacao: string | null; registradoPor: string },
    executor: Queryable,
  ): Promise<string> {
    const { rows } = await executor.query<{ id: string }>(
      `insert into pagamentos (fatura_id, client_id, valor, pago_em, forma, observacao, registrado_por)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [p.faturaId, p.clientId, p.valor, p.pagoEm, p.forma, p.observacao, p.registradoPor],
    );
    return rows[0].id;
  }

  async findPagamentos(faturaId: string): Promise<PagamentoRow[]> {
    const { rows } = await this.pool.query(
      `select id, valor, to_char(pago_em, 'YYYY-MM-DD') as pago_em, forma, observacao, registrado_em
         from pagamentos where fatura_id = $1 order by pago_em, registrado_em`,
      [faturaId],
    );
    return rows.map((r) => ({ id: r.id, valor: Number(r.valor), pagoEm: r.pago_em, forma: r.forma, observacao: r.observacao, registradoEm: new Date(r.registrado_em).getTime() }));
  }
}
