import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import { isPgError, PG_FOREIGN_KEY_VIOLATION, UNIQUE, violouUnique } from '../db/pg-errors';
import type { TipoInput } from './catalogo-ativos.dto';

export interface Marca { id: string; nome: string }
export interface Modelo { id: string; marcaId: string; nome: string }
export interface Tipo { id: string; nome: string; base: string; padrao: string | null; icone: string | null }
export interface Catalogo { marcas: Marca[]; modelos: Modelo[]; tipos: Tipo[] }

/** Nome repetido (mesma chave): devolve o que já existe, para a tela oferecer usar esse. */
export interface Repetido { repetido: { id: string; nome: string } }
const repetido = (r: { id: string; nome: string } | undefined): Repetido => ({ repetido: { id: r!.id, nome: r!.nome } });

/**
 * Marcas, modelos e tipos de ativo do cliente (três tabelas pequenas, lidas juntas pela tela) — não estende
 * `BaseRepository`, mas segue a mesma regra: `client_id` é o primeiro filtro de toda query (mesma convenção de
 * `MonitoringRepository`). Unicidade e "mesmo cliente" são garantidas pelo banco (chave gerada + FKs compostas).
 */
@Injectable()
export class CatalogoAtivosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listar(clientId: string): Promise<Catalogo> {
    const [marcas, modelos, tipos] = await Promise.all([
      this.pool.query<Marca>('select id, nome from ativo_marcas where client_id = $1 order by nome', [clientId]),
      this.pool.query<Modelo>('select id, marca_id as "marcaId", nome from ativo_modelos where client_id = $1 order by nome', [clientId]),
      this.pool.query<Tipo>('select id, nome, base, padrao, icone from ativo_tipos where client_id = $1 order by nome', [clientId]),
    ]);
    return { marcas: marcas.rows, modelos: modelos.rows, tipos: tipos.rows };
  }

  async criarMarca(clientId: string, nome: string): Promise<Marca | Repetido> {
    try {
      return (await this.pool.query<Marca>('insert into ativo_marcas (client_id, nome) values ($1, $2) returning id, nome', [clientId, nome])).rows[0];
    } catch (e) {
      if (!violouUnique(e, UNIQUE.ativoMarcaChave)) throw e;
      return repetido((await this.pool.query('select id, nome from ativo_marcas where client_id = $1 and chave = fn_chave_catalogo($2)', [clientId, nome])).rows[0]);
    }
  }

  async renomearMarca(clientId: string, id: string, nome: string): Promise<Marca | Repetido | null> {
    try {
      const { rows } = await this.pool.query<Marca>('update ativo_marcas set nome = $3, updated_at = now() where client_id = $1 and id = $2 returning id, nome', [clientId, id, nome]);
      return rows[0] ?? null;
    } catch (e) {
      if (!violouUnique(e, UNIQUE.ativoMarcaChave)) throw e;
      return repetido((await this.pool.query('select id, nome from ativo_marcas where client_id = $1 and chave = fn_chave_catalogo($2)', [clientId, nome])).rows[0]);
    }
  }

  /** `'marca_invalida'`: marca inexistente ou de outro cliente (a FK composta recusa). */
  async criarModelo(clientId: string, marcaId: string, nome: string): Promise<Modelo | Repetido | 'marca_invalida'> {
    try {
      const { rows } = await this.pool.query<Modelo>(
        'insert into ativo_modelos (client_id, marca_id, nome) values ($1, $2, $3) returning id, marca_id as "marcaId", nome',
        [clientId, marcaId, nome],
      );
      return rows[0];
    } catch (e) {
      if (isPgError(e, PG_FOREIGN_KEY_VIOLATION)) return 'marca_invalida';
      if (!violouUnique(e, UNIQUE.ativoModeloChave)) throw e;
      return repetido((await this.pool.query('select id, nome from ativo_modelos where client_id = $1 and marca_id = $2 and chave = fn_chave_catalogo($3)', [clientId, marcaId, nome])).rows[0]);
    }
  }

  async renomearModelo(clientId: string, id: string, nome: string): Promise<Modelo | Repetido | null> {
    try {
      const { rows } = await this.pool.query<Modelo>(
        'update ativo_modelos set nome = $3, updated_at = now() where client_id = $1 and id = $2 returning id, marca_id as "marcaId", nome',
        [clientId, id, nome],
      );
      return rows[0] ?? null;
    } catch (e) {
      if (!violouUnique(e, UNIQUE.ativoModeloChave)) throw e;
      return repetido((await this.pool.query(
        'select o.id, o.nome from ativo_modelos o join ativo_modelos m on m.marca_id = o.marca_id where m.client_id = $1 and m.id = $2 and o.chave = fn_chave_catalogo($3)',
        [clientId, id, nome],
      )).rows[0]);
    }
  }

  async criarTipo(clientId: string, t: TipoInput): Promise<Tipo | Repetido | 'padrao_repetido'> {
    try {
      const { rows } = await this.pool.query<Tipo>(
        'insert into ativo_tipos (client_id, nome, base, padrao, icone) values ($1, $2, $3, $4, $5) returning id, nome, base, padrao, icone',
        [clientId, t.nome, t.base, t.padrao, t.icone],
      );
      return rows[0];
    } catch (e) {
      return this.tipoRepetido(clientId, t.nome, e);
    }
  }

  /** `padrao` não muda: a linha continua renomeando o mesmo tipo pronto (ou continua sendo do cliente). */
  async atualizarTipo(clientId: string, id: string, t: TipoInput): Promise<Tipo | Repetido | 'padrao_repetido' | null> {
    try {
      const { rows } = await this.pool.query<Tipo>(
        'update ativo_tipos set nome = $3, base = $4, icone = $5, updated_at = now() where client_id = $1 and id = $2 returning id, nome, base, padrao, icone',
        [clientId, id, t.nome, t.base, t.icone],
      );
      return rows[0] ?? null;
    } catch (e) {
      return this.tipoRepetido(clientId, t.nome, e);
    }
  }

  private async tipoRepetido(clientId: string, nome: string, e: unknown): Promise<Repetido | 'padrao_repetido'> {
    if (violouUnique(e, UNIQUE.ativoTipoPadrao)) return 'padrao_repetido';
    if (!violouUnique(e, UNIQUE.ativoTipoChave)) throw e;
    return repetido((await this.pool.query('select id, nome from ativo_tipos where client_id = $1 and chave = fn_chave_catalogo($2)', [clientId, nome])).rows[0]);
  }
}
