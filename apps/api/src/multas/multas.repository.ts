import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';

export const STATUS_MULTA = ['aberta', 'condutor_indicado', 'paga', 'recurso', 'recurso_indeferido', 'cancelada'] as const;
export type StatusMulta = (typeof STATUS_MULTA)[number];
export const GRAVIDADES = ['Leve', 'Média', 'Grave', 'Gravíssima'] as const;
export type Gravidade = (typeof GRAVIDADES)[number];

export interface MultaRow {
  id: string;
  client_id: string;
  auto: string;
  orgao: string;
  asset_id: string;
  motorista_id: string | null;
  ts: Date;
  local: string;
  codigo: string;
  descricao: string;
  gravidade: Gravidade;
  pontos: number;
  valor: string;
  notificado_em: string | null;
  vencimento: string;
  status: StatusMulta;
  indicado_em: Date | null;
  origem: string;
  dados: Record<string, string | number>;
  created_at: Date;
  updated_at: Date;
}

export interface MultaInput {
  auto: string;
  orgao: string;
  assetId: string;
  motoristaId: string | null;
  ts: Date;
  local: string;
  codigo: string;
  descricao: string;
  gravidade: Gravidade;
  pontos: number;
  valor: number;
  notificadoEm: string | null;
  vencimento: string;
  status: StatusMulta;
  dados: Record<string, string | number>;
}

const SELECT = 'select *, notificado_em::text, vencimento::text from multas';

@Injectable()
export class MultasRepository extends BaseRepository<MultaRow> {
  protected readonly table = 'multas';

  async listar(clientId: string, de: Date, ate: Date, motoristaId: string | null): Promise<MultaRow[]> {
    const { rows } = await this.pool.query<MultaRow>(
      `${SELECT} where client_id = $1 and ts >= $2 and ts <= $3 and ($4::uuid is null or motorista_id = $4) order by ts desc`,
      [clientId, de, ate, motoristaId],
    );
    return rows;
  }

  async buscar(clientId: string, id: string): Promise<MultaRow | null> {
    const { rows } = await this.pool.query<MultaRow>(`${SELECT} where client_id = $1 and id = $2`, [clientId, id]);
    return rows[0] ?? null;
  }

  /** Ativo e motorista precisam ser do cliente: `insert ... select` com os dois no `where`. */
  async criar(clientId: string, m: MultaInput): Promise<MultaRow | 'ativo_invalido' | 'motorista_invalido'> {
    if (!(await this.pertence(clientId, 'assets', m.assetId))) return 'ativo_invalido';
    if (m.motoristaId && !(await this.pertence(clientId, 'motoristas', m.motoristaId))) return 'motorista_invalido';
    const row = await this.insert(clientId, this.colunas(m));
    return (await this.buscar(clientId, row.id))!;
  }

  async atualizar(clientId: string, id: string, m: MultaInput): Promise<MultaRow | null | 'ativo_invalido' | 'motorista_invalido'> {
    if (!(await this.pertence(clientId, 'assets', m.assetId))) return 'ativo_invalido';
    if (m.motoristaId && !(await this.pertence(clientId, 'motoristas', m.motoristaId))) return 'motorista_invalido';
    const row = await this.update(clientId, id, { ...this.colunas(m), updated_at: new Date() });
    return row ? this.buscar(clientId, id) : null;
  }

  /** Indicação do condutor: grava o motorista e o instante; status vai para `condutor_indicado` se estava aberta. */
  async indicar(clientId: string, id: string, motoristaId: string): Promise<MultaRow | null | 'motorista_invalido'> {
    if (!(await this.pertence(clientId, 'motoristas', motoristaId))) return 'motorista_invalido';
    const { rows } = await this.pool.query<{ id: string }>(
      `update multas set motorista_id = $3, indicado_em = coalesce(indicado_em, now()),
         status = case when status = 'aberta' then 'condutor_indicado' else status end, updated_at = now()
       where client_id = $1 and id = $2 returning id`,
      [clientId, id, motoristaId],
    );
    return rows[0] ? this.buscar(clientId, id) : null;
  }

  /** Pontos por motorista nos últimos 12 meses (pela data da infração), sem canceladas. */
  async pontosPorMotorista(clientId: string, desde: Date): Promise<{ motorista_id: string; nome: string; ear: boolean; pontos: number; gravissimas: number }[]> {
    const { rows } = await this.pool.query<{ motorista_id: string; nome: string; ear: boolean; pontos: number; gravissimas: number }>(
      `select m.id as motorista_id, m.nome, m.ear,
         coalesce(sum(x.pontos), 0)::int as pontos,
         count(*) filter (where x.gravidade = 'Gravíssima')::int as gravissimas
       from motoristas m
       left join multas x on x.client_id = m.client_id and x.motorista_id = m.id and x.ts >= $2 and x.status <> 'cancelada'
       where m.client_id = $1 and m.desativado_em is null
       group by m.id order by pontos desc, m.nome`,
      [clientId, desde],
    );
    return rows;
  }

  private async pertence(clientId: string, tabela: 'assets' | 'motoristas', id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`select 1 from ${tabela} where client_id = $1 and id = $2`, [clientId, id]);
    return (rowCount ?? 0) > 0;
  }

  private colunas(m: MultaInput) {
    return {
      auto: m.auto,
      orgao: m.orgao,
      asset_id: m.assetId,
      motorista_id: m.motoristaId,
      ts: m.ts,
      local: m.local,
      codigo: m.codigo,
      descricao: m.descricao,
      gravidade: m.gravidade,
      pontos: m.pontos,
      valor: m.valor,
      notificado_em: m.notificadoEm,
      vencimento: m.vencimento,
      status: m.status,
      dados: JSON.stringify(m.dados),
    };
  }
}
