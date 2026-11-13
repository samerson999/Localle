import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { Condicao } from '../regras/avaliar-regra';

export type Disparo = 'alarme' | 'condicao' | 'sistema';

export interface AlertaTipo {
  chave: string;
  /** alarme = o rastreador manda pronto (chave do Traccar); condicao = a plataforma avalia o estado; sistema = rotina. */
  disparo: Disparo;
  nome: string;
  prioridade: 'alta' | 'media' | 'baixa' | null;
  /** null = segue a prioridade do alerta (alta exige). */
  exigeTratamento: boolean | null;
  geraAlerta: boolean;
  notificaPush: boolean;
  condicoes: Condicao[] | null;
  duracaoMin: number;
  encerraSozinho: boolean;
  repetirMin: number;
  /** Gerado por rotina da plataforma: título, prioridade e disparo são da rotina; não se exclui. */
  sistema: boolean;
  /** Tipo padrão por condição: o que mede é fixo (campo e operador); só limite e duração mudam; não se exclui. */
  padrao: boolean;
  atualizadoEm: string;
}

export type AlertaTipoDados = Pick<
  AlertaTipo,
  'nome' | 'prioridade' | 'exigeTratamento' | 'geraAlerta' | 'notificaPush' | 'condicoes' | 'duracaoMin' | 'encerraSozinho' | 'repetirMin'
>;

/** Para o Setup do cliente: o que a plataforma oferece e se está ligado para ele (sem a regra interna). */
export interface AlertaTipoDoCliente {
  chave: string;
  nome: string;
  disparo: Disparo;
  prioridade: AlertaTipo['prioridade'];
  ligado: boolean;
  /** Só tipo padrão: o que é medido, o limite e a duração da plataforma e o ajuste do cliente (null = o da plataforma). */
  padrao: boolean;
  campo: string | null;
  operador: string | null;
  limitePadrao: string | null;
  duracaoPadrao: number;
  limite: string | null;
  duracaoMin: number | null;
}

export interface AjusteCliente {
  ligado?: boolean;
  /** null = volta ao padrão da plataforma; ausente = não muda. */
  valor?: number | null;
  duracaoMin?: number | null;
}

const SELECT = `select chave, disparo, nome, prioridade, exige_tratamento as "exigeTratamento", gera_alerta as "geraAlerta",
  notifica_push as "notificaPush", condicoes, duracao_min as "duracaoMin", encerra_sozinho as "encerraSozinho",
  repetir_min as "repetirMin", sistema, padrao, atualizado_em as "atualizadoEm" from alerta_tipos`;

/**
 * Catálogo global da plataforma (sem `client_id`, como `rastreador_modelos`): não estende `BaseRepository`. Só a
 * camada de superadmin escreve; a ingestão lê direto na transação dela. A exceção por cliente (`alerta_tipos_cliente`)
 * tem `client_id` e todo acesso a ela filtra por ele.
 */
@Injectable()
export class AlertaTiposRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listar(): Promise<AlertaTipo[]> {
    const { rows } = await this.pool.query<AlertaTipo>(`${SELECT} order by sistema desc, disparo, lower(nome)`);
    return rows;
  }

  async buscar(chave: string, executor: Queryable = this.pool): Promise<AlertaTipo | null> {
    const { rows } = await executor.query<AlertaTipo>(`${SELECT} where chave = $1`, [chave]);
    return rows[0] ?? null;
  }

  async criar(chave: string, disparo: 'alarme' | 'condicao', d: AlertaTipoDados): Promise<AlertaTipo> {
    await this.pool.query(
      `insert into alerta_tipos (chave, disparo, nome, prioridade, exige_tratamento, gera_alerta, notifica_push, condicoes, duracao_min,
         encerra_sozinho, repetir_min)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [chave, disparo, d.nome, d.prioridade, d.exigeTratamento, d.geraAlerta, d.notificaPush,
        disparo === 'condicao' ? JSON.stringify(d.condicoes) : null, d.duracaoMin, d.encerraSozinho, d.repetirMin],
    );
    return (await this.buscar(chave))!;
  }

  /**
   * Só os campos enviados mudam. Tipo de sistema: título, prioridade, "gera alerta" e a forma de disparar são da
   * rotina — só tratamento e notificação mudam. Condição/duração/encerramento só existem no tipo por condição.
   */
  async atualizar(chave: string, d: Partial<AlertaTipoDados>): Promise<AlertaTipo | null> {
    const tem = (k: keyof AlertaTipoDados) => k in d;
    const { rowCount } = await this.pool.query(
      `update alerta_tipos set
         nome = case when sistema or not $2 then nome else $3 end,
         prioridade = case when sistema or not $4 then prioridade else $5 end,
         exige_tratamento = case when $6 then $7 else exige_tratamento end,
         gera_alerta = case when sistema or not $8 then gera_alerta else $9 end,
         notifica_push = case when $10 then $11 else notifica_push end,
         condicoes = case when disparo = 'condicao' and $12 then $13::jsonb else condicoes end,
         duracao_min = case when disparo = 'condicao' and $14 then $15 else duracao_min end,
         encerra_sozinho = case when disparo = 'condicao' and $16 then $17 else encerra_sozinho end,
         repetir_min = case when $18 then $19 else repetir_min end,
         atualizado_em = now()
       where chave = $1`,
      [
        chave,
        tem('nome'), d.nome ?? null,
        tem('prioridade'), d.prioridade ?? null,
        tem('exigeTratamento'), d.exigeTratamento ?? null,
        tem('geraAlerta'), d.geraAlerta ?? null,
        tem('notificaPush'), d.notificaPush ?? null,
        tem('condicoes'), d.condicoes ? JSON.stringify(d.condicoes) : null,
        tem('duracaoMin'), d.duracaoMin ?? null,
        tem('encerraSozinho'), d.encerraSozinho ?? null,
        tem('repetirMin'), d.repetirMin ?? null,
      ],
    );
    return rowCount ? this.buscar(chave) : null;
  }

  /** Só tipo que não é de sistema nem padrão; devolve false se não existe (ou é protegido). */
  async excluir(chave: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from alerta_tipos where chave = $1 and not sistema and not padrao', [chave]);
    return (rowCount ?? 0) > 0;
  }

  /** Os que geram alerta, com o ligado/desligado e o ajuste do cliente (sem linha = ligado, com o padrão). */
  async doCliente(clientId: string): Promise<AlertaTipoDoCliente[]> {
    const { rows } = await this.pool.query<AlertaTipoDoCliente>(
      `select t.chave, t.nome, t.disparo, t.prioridade, coalesce(c.ligado, true) as ligado, t.padrao,
              case when t.padrao then t.condicoes->0->>'field' end as campo,
              case when t.padrao then t.condicoes->0->>'op' end as operador,
              case when t.padrao then t.condicoes->0->>'value' end as "limitePadrao",
              t.duracao_min as "duracaoPadrao",
              case when t.padrao then c.valor::text end as limite,
              case when t.padrao then c.duracao_min end as "duracaoMin"
         from alerta_tipos t
         left join alerta_tipos_cliente c on c.client_id = $1 and c.chave = t.chave
        where t.gera_alerta
        order by t.sistema desc, t.padrao desc, lower(t.nome)`,
      [clientId],
    );
    return rows;
  }

  /** Grava só o que veio. `false` se o tipo não existe ou não gera alerta; limite/duração só valem no tipo padrão. */
  async definirDoCliente(clientId: string, chave: string, a: AjusteCliente, userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `insert into alerta_tipos_cliente (client_id, chave, ligado, valor, duracao_min, alterado_por)
       select $1, t.chave, coalesce($3, true), case when t.padrao then $5::numeric end, case when t.padrao then $7::int end, $8
         from alerta_tipos t where t.chave = $2 and t.gera_alerta
       on conflict (client_id, chave) do update set
         ligado = coalesce($3, alerta_tipos_cliente.ligado),
         valor = case when $4 then excluded.valor else alerta_tipos_cliente.valor end,
         duracao_min = case when $6 then excluded.duracao_min else alerta_tipos_cliente.duracao_min end,
         alterado_por = excluded.alterado_por, alterado_em = now()`,
      [clientId, chave, a.ligado ?? null, 'valor' in a, a.valor ?? null, 'duracaoMin' in a, a.duracaoMin ?? null, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
