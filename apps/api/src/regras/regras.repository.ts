import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';
import type { Condicao } from './avaliar-regra';
import type { Acoes, RegraInput } from './dto/regra.dto';

interface RegraRow {
  id: string;
  client_id: string;
  nome: string;
  ativa: boolean;
  prioridade: 'alta' | 'media' | 'baixa';
  condicoes: Condicao[];
  acoes: Acoes;
}

export interface Regra {
  id: string;
  nome: string;
  ativa: boolean;
  prioridade: 'alta' | 'media' | 'baixa';
  condicoes: Condicao[];
  acoes: Acoes;
  /** Disparos (alertas de regra) nos últimos 30 dias — a coluna "Disparos" da tela. */
  disparos30d: number;
}

const SELECT = `
  select r.id, r.client_id, r.nome, r.ativa, r.prioridade, r.condicoes, r.acoes,
    (select count(*)::int from eventos e
      where e.client_id = r.client_id and e.tipo = 'regra' and e.ts > now() - interval '30 days'
        and e.attributes->>'regraId' = r.id::text) as disparos30d
  from regras r`;

/** `client_id` é sempre o primeiro filtro (regra do BaseRepository). Remover é lógico (`removida_em`). */
@Injectable()
export class RegrasRepository extends BaseRepository<RegraRow> {
  protected readonly table = 'regras';

  async listar(clientId: string): Promise<Regra[]> {
    const { rows } = await this.pool.query<Regra & { client_id: string }>(
      `${SELECT} where r.client_id = $1 and r.removida_em is null order by r.nome`,
      [clientId],
    );
    return rows.map(({ client_id: _, ...r }) => r);
  }

  async buscar(clientId: string, id: string): Promise<Regra | null> {
    const { rows } = await this.pool.query<Regra & { client_id: string }>(
      `${SELECT} where r.client_id = $1 and r.id = $2 and r.removida_em is null`,
      [clientId, id],
    );
    if (!rows[0]) return null;
    const { client_id: _, ...r } = rows[0];
    return r;
  }

  async criar(clientId: string, r: RegraInput): Promise<Regra> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into regras (client_id, nome, ativa, prioridade, condicoes, acoes) values ($1, $2, $3, $4, $5, $6) returning id`,
      [clientId, r.nome, r.ativa, r.prioridade, JSON.stringify(r.condicoes), JSON.stringify(r.acoes)],
    );
    return (await this.buscar(clientId, rows[0].id))!;
  }

  async atualizar(clientId: string, id: string, r: RegraInput): Promise<Regra | null> {
    const { rowCount } = await this.pool.query(
      `update regras set nome = $3, ativa = $4, prioridade = $5, condicoes = $6, acoes = $7, atualizado_em = now()
       where client_id = $1 and id = $2 and removida_em is null`,
      [clientId, id, r.nome, r.ativa, r.prioridade, JSON.stringify(r.condicoes), JSON.stringify(r.acoes)],
    );
    return rowCount ? this.buscar(clientId, id) : null;
  }

  async remover(clientId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'update regras set removida_em = now(), ativa = false where client_id = $1 and id = $2 and removida_em is null',
      [clientId, id],
    );
    return (rowCount ?? 0) > 0;
  }
}
