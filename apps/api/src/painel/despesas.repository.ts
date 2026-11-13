import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

export type TipoDespesa = 'fixa' | 'por_veiculo';

/** Meses em 'YYYY-MM'; `fimEm` null = sem fim. */
export interface DespesaDados {
  nome: string;
  tipo: TipoDespesa;
  valor: number;
  inicioEm: string;
  fimEm: string | null;
  observacao: string | null;
}
export interface Despesa extends DespesaDados {
  id: string;
  atualizadoEm: string;
}

const COLUNAS = `id, nome, tipo, valor::float8 as valor, to_char(inicio_em, 'YYYY-MM') as inicio_em,
  to_char(fim_em, 'YYYY-MM') as fim_em, observacao, atualizado_em`;
const linha = (r: Record<string, any>): Despesa => ({
  id: r.id, nome: r.nome, tipo: r.tipo, valor: r.valor, inicioEm: r.inicio_em, fimEm: r.fim_em, observacao: r.observacao,
  atualizadoEm: r.atualizado_em.toISOString(),
});
const mes = (ym: string | null) => (ym ? `${ym}-01` : null);
const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Despesas da Locale (custo da Visão geral do Console). Dado da plataforma, sem client_id — rotas só de superadmin.
 */
@Injectable()
export class DespesasRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listar(): Promise<Despesa[]> {
    const { rows } = await this.pool.query(`select ${COLUNAS} from despesas_plataforma order by fim_em is not null, nome`);
    return rows.map(linha);
  }

  async buscar(id: string): Promise<Despesa | null> {
    const { rows } = await this.pool.query(`select ${COLUNAS} from despesas_plataforma where id = $1`, [id]);
    return rows[0] ? linha(rows[0]) : null;
  }

  async criar(d: DespesaDados): Promise<Despesa> {
    const { rows } = await this.pool.query(
      `insert into despesas_plataforma (nome, tipo, valor, inicio_em, fim_em, observacao) values ($1, $2, $3, $4, $5, $6) returning ${COLUNAS}`,
      [d.nome, d.tipo, d.valor, mes(d.inicioEm), mes(d.fimEm), d.observacao],
    );
    return linha(rows[0]);
  }

  async atualizar(id: string, d: DespesaDados): Promise<Despesa | null> {
    const { rows } = await this.pool.query(
      `update despesas_plataforma set nome = $2, tipo = $3, valor = $4, inicio_em = $5, fim_em = $6, observacao = $7, atualizado_em = now()
        where id = $1 returning ${COLUNAS}`,
      [id, d.nome, d.tipo, d.valor, mes(d.inicioEm), mes(d.fimEm), d.observacao],
    );
    return rows[0] ? linha(rows[0]) : null;
  }

  async excluir(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from despesas_plataforma where id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}

/** Custo de um mês: despesas vigentes em `ym`; as por veículo multiplicam pelos veículos do mês. */
export function custoDoMes(despesas: Despesa[], ym: string, veiculos: number) {
  const vigentes = despesas.filter((d) => d.inicioEm <= ym && (d.fimEm === null || d.fimEm >= ym));
  const itens = vigentes.map((d) => ({ id: d.id, nome: d.nome, tipo: d.tipo, valorUnitario: d.valor, total: centavos(d.tipo === 'fixa' ? d.valor : d.valor * veiculos) }));
  const soma = (t: TipoDespesa) => centavos(itens.filter((i) => i.tipo === t).reduce((a, i) => a + i.total, 0));
  const fixas = soma('fixa');
  const porVeiculo = soma('por_veiculo');
  return { fixas, porVeiculo, total: centavos(fixas + porVeiculo), itens };
}
