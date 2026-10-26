import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ContractStatus, ContractTerms, ContractVersion, DailyMeasurement } from '@localle/shared/contratos';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';

/** Fuso das competências e da medição diária (mesmo `TZ` de infra/plataforma). */
export const TZ_COMPETENCIA = 'America/Recife';

export interface ContratoRow {
  id: string;
  clientId: string;
  clientName: string;
  status: ContractStatus;
  inicioEm: string; // YYYY-MM-DD
  fimEm: string | null;
  versaoAtual: ContractVersion;
  versoes: number;
}

const VERSAO_COLS = `v.id, v.criado_em, v.tipo_cobranca, v.mensalidade_fixa, v.franquia, v.mensalidade_base,
  v.preco_por_veiculo, v.preco_excedente, v.modulos, v.max_usuarios, v.historico_meses, v.dia_vencimento, v.tolerancia_dias`;

// numeric do pg chega como string — convertido aqui, num lugar só
export function toVersion(r: any): ContractVersion {
  return {
    id: r.id,
    createdAt: new Date(r.criado_em).getTime(),
    billingType: r.tipo_cobranca,
    fixedPrice: Number(r.mensalidade_fixa),
    included: r.franquia,
    basePrice: Number(r.mensalidade_base),
    pricePerVehicle: Number(r.preco_por_veiculo),
    extraPrice: Number(r.preco_excedente),
    modules: r.modulos,
    maxUsers: r.max_usuarios,
    historyMonths: r.historico_meses,
    dueDay: r.dia_vencimento,
    toleranceDays: r.tolerancia_dias,
  };
}

/**
 * Contratos são da camada administrativa (superadmin) e cruzam clientes de propósito — como
 * `ClientsRepository`, não estende `BaseRepository`. Toda escrita recebe `client_id`/`contrato_id` explícito.
 */
@Injectable()
export class ContratosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private selectContratos(where: string) {
    return `select c.id as contrato_id, c.client_id, cl.name as client_name, c.status, to_char(c.inicio_em, 'YYYY-MM-DD') as inicio_em,
              to_char(c.fim_em, 'YYYY-MM-DD') as fim_em,
              (select count(*)::int from contrato_versoes x where x.contrato_id = c.id) as versoes,
              ${VERSAO_COLS}
         from contratos c
         join clients cl on cl.id = c.client_id
         join lateral (select * from contrato_versoes v where v.contrato_id = c.id order by v.criado_em desc, v.id desc limit 1) v on true
        ${where}
        order by cl.name`;
  }

  private toRow(r: any): ContratoRow {
    return {
      id: r.contrato_id,
      clientId: r.client_id,
      clientName: r.client_name,
      status: r.status,
      inicioEm: r.inicio_em,
      fimEm: r.fim_em,
      versaoAtual: toVersion(r),
      versoes: r.versoes,
    };
  }

  async findAll(executor: Queryable = this.pool): Promise<ContratoRow[]> {
    const { rows } = await executor.query(this.selectContratos(''));
    return rows.map((r) => this.toRow(r));
  }

  async findByClient(clientId: string, executor: Queryable = this.pool): Promise<ContratoRow | null> {
    const { rows } = await executor.query(this.selectContratos('where c.client_id = $1'), [clientId]);
    return rows[0] ? this.toRow(rows[0]) : null;
  }

  async findById(id: string, executor: Queryable = this.pool): Promise<ContratoRow | null> {
    const { rows } = await executor.query(this.selectContratos('where c.id = $1'), [id]);
    return rows[0] ? this.toRow(rows[0]) : null;
  }

  async insertContrato(
    data: { clientId: string; status: ContractStatus; inicioEm: string; fimEm: string | null },
    executor: Queryable,
  ): Promise<string> {
    const { rows } = await executor.query<{ id: string }>(
      'insert into contratos (client_id, status, inicio_em, fim_em) values ($1, $2, $3, $4) returning id',
      [data.clientId, data.status, data.inicioEm, data.fimEm],
    );
    return rows[0].id;
  }

  async updateMeta(id: string, data: { status: ContractStatus; fimEm: string | null }, executor: Queryable): Promise<void> {
    await executor.query('update contratos set status = $2, fim_em = $3, atualizado_em = now() where id = $1', [
      id,
      data.status,
      data.fimEm,
    ]);
  }

  async insertVersao(contratoId: string, clientId: string, t: ContractTerms, criadoPor: string, executor: Queryable): Promise<void> {
    await executor.query(
      `insert into contrato_versoes (contrato_id, client_id, tipo_cobranca, mensalidade_fixa, franquia, mensalidade_base,
         preco_por_veiculo, preco_excedente, modulos, max_usuarios, historico_meses, dia_vencimento, tolerancia_dias, criado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [contratoId, clientId, t.billingType, t.fixedPrice, t.included, t.basePrice, t.pricePerVehicle, t.extraPrice,
        t.modules, t.maxUsers, t.historyMonths, t.dueDay, t.toleranceDays, criadoPor],
    );
  }

  async findVersoes(contratoId: string): Promise<ContractVersion[]> {
    const { rows } = await this.pool.query(
      `select ${VERSAO_COLS} from contrato_versoes v where v.contrato_id = $1 order by v.criado_em, v.id`,
      [contratoId],
    );
    return rows.map(toVersion);
  }

  /** Veículos instalados agora, por cliente (instalação vigente), para a estimativa. */
  async veiculosAgora(): Promise<Map<string, number>> {
    const { rows } = await this.pool.query<{ client_id: string; n: number }>(
      `select client_id, count(distinct asset_id)::int as n from instalacoes where desinstalado_em is null group by client_id`,
    );
    return new Map(rows.map((r) => [r.client_id, r.n]));
  }

  /**
   * Medição diária de veículos-dia de uma competência ('YYYY-MM'): um veículo conta no dia se teve
   * instalação vigente em algum momento dele. Só até hoje no mês corrente — o futuro não é medido.
   */
  async medicaoDiaria(ym: string, executor: Queryable = this.pool): Promise<Map<string, DailyMeasurement[]>> {
    const { rows } = await executor.query<{ client_id: string; dia: string; n: number }>(
      `with dias as (
         select d::date as dia,
                (d::date)::timestamp at time zone '${TZ_COMPETENCIA}' as ini,
                (d::date + 1)::timestamp at time zone '${TZ_COMPETENCIA}' as fim
           from generate_series(($1 || '-01')::date,
                                least((($1 || '-01')::date + interval '1 month' - interval '1 day')::date,
                                      (now() at time zone '${TZ_COMPETENCIA}')::date),
                                interval '1 day') d
       )
       select i.client_id, to_char(dias.dia, 'YYYY-MM-DD') as dia, count(distinct i.asset_id)::int as n
         from dias
         join instalacoes i on i.instalado_em < dias.fim and (i.desinstalado_em is null or i.desinstalado_em > dias.ini)
        group by i.client_id, dias.dia`,
      [ym],
    );
    const out = new Map<string, DailyMeasurement[]>();
    for (const r of rows) {
      const list = out.get(r.client_id) ?? [];
      list.push({ date: r.dia, activeVehicles: r.n });
      out.set(r.client_id, list);
    }
    return out;
  }
}
