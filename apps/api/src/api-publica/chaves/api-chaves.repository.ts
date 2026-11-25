import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../db/base.repository';

export interface ApiChaveRow {
  id: string;
  client_id: string;
  nome: string;
  prefixo: string;
  hash: Buffer;
  escopos: string[];
  /** Chaves antigas, geradas pelo admin do cliente no Setup (até 23/11/2026). */
  criada_por: string | null;
  criada_por_superadmin: string | null;
  criada_em: Date;
  expira_em: Date | null;
  revogada_em: Date | null;
  resetada_em: Date | null;
  ultimo_uso_em: Date | null;
}

/** O que a tela recebe: nunca o hash. */
export type ApiChaveVisivel = Omit<ApiChaveRow, 'hash'> & { client_name: string; criada_por_email: string | null };

export const MAX_CHAVES_ATIVAS = 10;

const SELECT_VISIVEL = `
  select k.id, k.client_id, c.name as client_name, k.nome, k.prefixo, k.escopos, k.criada_por, k.criada_por_superadmin,
         k.criada_em, k.expira_em, k.revogada_em, k.resetada_em, k.ultimo_uso_em,
         coalesce(s.email, u.email) as criada_por_email
    from api_chaves k
    join clients c on c.id = k.client_id
    left join superadmins s on s.id = k.criada_por_superadmin
    left join users u on u.id = k.criada_por`;

/**
 * Chaves de acesso dos clientes (migrations 1794470000000 e 1794480000000). Geradas, resetadas e revogadas pela
 * equipe da Localle no Console (rotas de superadmin): as leituras de gestão atravessam clientes de propósito, como as
 * demais telas do Console. Escrita sempre por (`client_id`, `id`), com o cliente da própria chave.
 */
@Injectable()
export class ApiChavesRepository extends BaseRepository<ApiChaveRow> {
  protected readonly table = 'api_chaves';

  /** Console: todas as chaves, ou só as de um cliente. Ativas primeiro. */
  async listarTodas(clientId: string | null): Promise<ApiChaveVisivel[]> {
    const { rows } = await this.pool.query<ApiChaveVisivel>(
      `${SELECT_VISIVEL} where ($1::uuid is null or k.client_id = $1)
        order by k.revogada_em is not null, c.name, k.criada_em desc`,
      [clientId],
    );
    return rows;
  }

  /** Console: uma chave pelo id, para saber de qual cliente é antes de resetar ou revogar. */
  async buscarPorId(id: string): Promise<ApiChaveVisivel | null> {
    const { rows } = await this.pool.query<ApiChaveVisivel>(`${SELECT_VISIVEL} where k.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async clienteExiste(clientId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('select 1 from clients where id = $1', [clientId]);
    return (rowCount ?? 0) > 0;
  }

  async contarAtivas(clientId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      `select count(*)::int as n from api_chaves
        where client_id = $1 and revogada_em is null and (expira_em is null or expira_em > now())`,
      [clientId],
    );
    return rows[0].n;
  }

  async criar(
    clientId: string,
    d: { nome: string; prefixo: string; hash: Buffer; escopos: string[]; superadminId: string; expiraEm: Date | null },
  ): Promise<ApiChaveRow> {
    return this.insert(clientId, {
      nome: d.nome,
      prefixo: d.prefixo,
      hash: d.hash,
      escopos: d.escopos,
      criada_por_superadmin: d.superadminId,
      expira_em: d.expiraEm,
    });
  }

  /** Reset: valor novo na mesma chave (mesmos escopos e validade); o antigo deixa de existir. `false` se revogada. */
  async trocarValor(clientId: string, id: string, hash: Buffer, prefixo: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update api_chaves set hash = $3, prefixo = $4, resetada_em = now()
        where client_id = $1 and id = $2 and revogada_em is null`,
      [clientId, id, hash, prefixo],
    );
    return (rowCount ?? 0) > 0;
  }

  /** `false` se a chave não é do cliente ou já estava revogada. */
  async revogar(clientId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'update api_chaves set revogada_em = now() where client_id = $1 and id = $2 and revogada_em is null',
      [clientId, id],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Autenticação da API pública: a chave É o que identifica o cliente, então a busca é pelo hash, sem `client_id`.
   * Só devolve chave válida (não revogada, não vencida).
   */
  async buscarValidaPorHash(hash: Buffer): Promise<ApiChaveRow | null> {
    const { rows } = await this.pool.query<ApiChaveRow>(
      `select * from api_chaves where hash = $1 and revogada_em is null and (expira_em is null or expira_em > now())`,
      [hash],
    );
    return rows[0] ?? null;
  }

  async marcarUso(id: string): Promise<void> {
    await this.pool.query('update api_chaves set ultimo_uso_em = now() where id = $1', [id]);
  }

  /** E-mails dos admins ativos do cliente — aviso de chave criada. */
  async emailsDosAdmins(clientId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ email: string }>(
      `select email from users where client_id = $1 and role = 'admin' and desativado_em is null`,
      [clientId],
    );
    return rows.map((r) => r.email);
  }
}
