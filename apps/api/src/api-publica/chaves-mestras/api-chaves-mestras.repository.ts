import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../db/pg-pool.provider';

export interface ApiChaveMestraRow {
  id: string;
  nome: string;
  prefixo: string;
  hash: Buffer;
  ips_permitidos: string[];
  criada_por: string | null;
  criada_em: Date;
  expira_em: Date;
  revogada_em: Date | null;
  resetada_em: Date | null;
  ultimo_uso_em: Date | null;
}

export type ApiChaveMestraVisivel = Omit<ApiChaveMestraRow, 'hash'> & { criada_por_email: string | null };

export const MAX_DIAS_MESTRA = 90;

const COLUNAS_VISIVEIS = `k.id, k.nome, k.prefixo, k.ips_permitidos::text[] as ips_permitidos, k.criada_por, k.criada_em,
  k.expira_em, k.revogada_em, k.resetada_em, k.ultimo_uso_em, s.email as criada_por_email`;

/**
 * Chaves mestras da equipe da Localle (migration 1794470000000, docs/PLANO-API-PUBLICA.md § 3.6). Fora da hierarquia
 * de clientes, como `superadmins` — não estende `BaseRepository`. Só rotas de superadmin e o guard da API pública
 * chegam aqui.
 */
@Injectable()
export class ApiChavesMestrasRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listar(): Promise<ApiChaveMestraVisivel[]> {
    const { rows } = await this.pool.query<ApiChaveMestraVisivel>(
      `select ${COLUNAS_VISIVEIS} from api_chaves_mestras k left join superadmins s on s.id = k.criada_por
        order by k.revogada_em is not null, k.criada_em desc`,
    );
    return rows;
  }

  async criar(d: { nome: string; prefixo: string; hash: Buffer; ips: string[]; criadaPor: string; expiraEm: Date }): Promise<ApiChaveMestraRow> {
    const { rows } = await this.pool.query<ApiChaveMestraRow>(
      `insert into api_chaves_mestras (nome, prefixo, hash, ips_permitidos, criada_por, expira_em)
       values ($1, $2, $3, $4::cidr[], $5, $6) returning *, ips_permitidos::text[] as ips_permitidos`,
      [d.nome, d.prefixo, d.hash, d.ips, d.criadaPor, d.expiraEm],
    );
    return rows[0];
  }

  async trocarValor(id: string, hash: Buffer, prefixo: string): Promise<ApiChaveMestraRow | null> {
    const { rows } = await this.pool.query<ApiChaveMestraRow>(
      `update api_chaves_mestras set hash = $2, prefixo = $3, resetada_em = now()
        where id = $1 and revogada_em is null and expira_em > now()
       returning *, ips_permitidos::text[] as ips_permitidos`,
      [id, hash, prefixo],
    );
    return rows[0] ?? null;
  }

  async revogar(id: string): Promise<ApiChaveMestraRow | null> {
    const { rows } = await this.pool.query<ApiChaveMestraRow>(
      `update api_chaves_mestras set revogada_em = now() where id = $1 and revogada_em is null
       returning *, ips_permitidos::text[] as ips_permitidos`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Autenticação: só chave válida; o IP é conferido no guard (lista CIDR). */
  async buscarValidaPorHash(hash: Buffer): Promise<ApiChaveMestraRow | null> {
    const { rows } = await this.pool.query<ApiChaveMestraRow>(
      `select *, ips_permitidos::text[] as ips_permitidos from api_chaves_mestras
        where hash = $1 and revogada_em is null and expira_em > now()`,
      [hash],
    );
    return rows[0] ?? null;
  }

  async marcarUso(id: string): Promise<void> {
    await this.pool.query('update api_chaves_mestras set ultimo_uso_em = now() where id = $1', [id]);
  }

  /** Cada consulta com chave mestra; só o Console lê. */
  async registrarAcesso(a: { chaveId: string; clientId: string | null; rota: string; ip: string | null; status: number }): Promise<void> {
    await this.pool.query(
      `insert into api_chaves_mestras_acessos (chave_id, client_id, rota, ip, status) values ($1, $2, $3, $4::inet, $5)`,
      [a.chaveId, a.clientId, a.rota, a.ip, a.status],
    );
  }

  /** O IP já usou esta chave antes? (aviso de IP novo por e-mail) */
  async ipJaUsado(chaveId: string, ip: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'select 1 from api_chaves_mestras_acessos where chave_id = $1 and ip = $2::inet limit 1',
      [chaveId, ip],
    );
    return (rowCount ?? 0) > 0;
  }

  async acessos(chaveId: string, limite = 200) {
    const { rows } = await this.pool.query<{ client_id: string | null; client_name: string | null; rota: string; ip: string | null; status: number; criado_em: Date }>(
      `select a.client_id, c.name as client_name, a.rota, host(a.ip) as ip, a.status, a.criado_em
         from api_chaves_mestras_acessos a left join clients c on c.id = a.client_id
        where a.chave_id = $1 order by a.criado_em desc limit $2`,
      [chaveId, limite],
    );
    return rows;
  }

  async clienteExiste(clientId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('select 1 from clients where id = $1', [clientId]);
    return (rowCount ?? 0) > 0;
  }

  async listarClientes(): Promise<{ id: string; nome: string }[]> {
    const { rows } = await this.pool.query<{ id: string; nome: string }>('select id, name as nome from clients order by name');
    return rows;
  }

  async emailsDosSuperadmins(): Promise<string[]> {
    const { rows } = await this.pool.query<{ email: string }>('select email from superadmins where desativado_em is null');
    return rows.map((r) => r.email);
  }
}
