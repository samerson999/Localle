import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';

export const TIPOS_RELATORIO = ['cercas', 'velocidade', 'posicoes', 'passou_por_aqui', 'uso'] as const;
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number];
export const FORMATOS_RELATORIO = ['pdf', 'xlsx', 'csv'] as const;
export type FormatoRelatorio = (typeof FORMATOS_RELATORIO)[number];

export interface RelatorioGeradoRow {
  id: string;
  client_id: string;
  user_id: string | null;
  tipo: TipoRelatorio;
  periodo_inicio: Date;
  periodo_fim: Date;
  filtros: string;
  registros: number;
  formato: FormatoRelatorio;
  created_at: Date;
}

export type RelatorioGeradoComAutor = RelatorioGeradoRow & { gerado_por: string | null };

@Injectable()
export class RelatoriosGeradosRepository extends BaseRepository<RelatorioGeradoRow> {
  protected readonly table = 'relatorios_gerados';

  /** Mais recentes primeiro, com o e-mail de quem gerou (só usuário do próprio cliente). */
  async recentes(clientId: string, limite: number): Promise<RelatorioGeradoComAutor[]> {
    const { rows } = await this.pool.query<RelatorioGeradoComAutor>(
      `select r.*, u.email as gerado_por
       from relatorios_gerados r
       left join users u on u.id = r.user_id and u.client_id = r.client_id
       where r.client_id = $1
       order by r.created_at desc, r.id desc
       limit $2`,
      [clientId, limite],
    );
    return rows;
  }

  /** `user_id` só fica gravado se o usuário for do cliente; acesso de suporte grava nulo. */
  async registrar(
    clientId: string,
    userId: string,
    r: { tipo: TipoRelatorio; inicio: Date; fim: Date; filtros: string; registros: number; formato: FormatoRelatorio },
  ): Promise<RelatorioGeradoRow> {
    const { rows } = await this.pool.query<RelatorioGeradoRow>(
      `insert into relatorios_gerados (client_id, user_id, tipo, periodo_inicio, periodo_fim, filtros, registros, formato)
       values ($1, (select id from users where client_id = $1 and id = $2), $3, $4, $5, $6, $7, $8)
       returning *`,
      [clientId, userId, r.tipo, r.inicio, r.fim, r.filtros, r.registros, r.formato],
    );
    return rows[0];
  }
}
