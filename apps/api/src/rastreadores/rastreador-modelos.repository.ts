import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { RastreadorModeloEntity } from './rastreador-modelo.entity';

export type ModeloDados = Pick<RastreadorModeloEntity, 'fabricante' | 'nome' | 'protocolo' | 'porta' | 'tipo_identificador'> &
  Partial<Pick<RastreadorModeloEntity, 'atributo_tensao' | 'sinal_max' | 'atributo_bloqueio' | 'origem'>>;

/** `ultima_posicao` (alias `up`), só posição válida: lat/lon saem do ponto PostGIS. */
const COLUNAS_ULTIMA_POSICAO = `up.fix_time as posicao_em, st_y(up.geom) as latitude, st_x(up.geom) as longitude,
              up.speed_kmh::float8 as velocidade_kmh, up.ignition as ignicao`;

export interface EstadoRastreadorRow {
  id: string; imei: string; status: string; protocolo: string | null; traccar_device_id: string | null; modelo_id: string | null;
  ultimo_pacote_em: Date | null; ultimos_atributos: Record<string, unknown> | null; atributos_em: Date | null;
  atributo_tensao: string | null; sinal_max: number | null; atributo_bloqueio: string | null;
  posicao_em: Date | null; latitude: number | null; longitude: number | null; velocidade_kmh: number | null; ignicao: boolean | null;
}

/**
 * Catálogo global de modelos (sem `client_id`, como `rastreadores`): não estende `BaseRepository` pelo mesmo motivo
 * de `RastreadoresRepository`. Só a camada de superadmin acessa.
 */
@Injectable()
export class RastreadorModelosRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listar(): Promise<(RastreadorModeloEntity & { rastreadores: number })[]> {
    const { rows } = await this.pool.query(
      `select m.*, (select count(*)::int from rastreadores r where r.modelo_id = m.id and r.status <> 'desativado') as rastreadores
         from rastreador_modelos m
        order by m.ativo desc, lower(m.fabricante), lower(m.nome)`,
    );
    return rows;
  }

  async findById(id: string, executor: Queryable = this.pool): Promise<RastreadorModeloEntity | null> {
    const { rows } = await executor.query<RastreadorModeloEntity>('select * from rastreador_modelos where id = $1', [id]);
    return rows[0] ?? null;
  }

  async criar(d: ModeloDados, executor: Queryable = this.pool): Promise<RastreadorModeloEntity> {
    const { rows } = await executor.query<RastreadorModeloEntity>(
      `insert into rastreador_modelos (fabricante, nome, protocolo, porta, tipo_identificador, atributo_tensao, sinal_max, atributo_bloqueio, origem)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [d.fabricante, d.nome, d.protocolo, d.porta, d.tipo_identificador, d.atributo_tensao ?? null, d.sinal_max ?? null, d.atributo_bloqueio ?? null, d.origem ?? 'manual'],
    );
    return rows[0];
  }

  async findByNome(fabricante: string, nome: string): Promise<RastreadorModeloEntity | null> {
    const { rows } = await this.pool.query<RastreadorModeloEntity>(
      'select * from rastreador_modelos where lower(fabricante) = lower($1) and lower(nome) = lower($2)',
      [fabricante, nome],
    );
    return rows[0] ?? null;
  }

  /** Modelos ativos do catálogo cujo nome exibido ("fabricante nome") ou protocolo contém o termo. */
  async buscarAtivos(termo: string, limite: number): Promise<RastreadorModeloEntity[]> {
    const { rows } = await this.pool.query<RastreadorModeloEntity>(
      `select * from rastreador_modelos
        where ativo and (fabricante || ' ' || nome ilike $1 or nome ilike $1 or protocolo ilike $1)
        order by lower(fabricante), lower(nome) limit $2`,
      [termo, limite],
    );
    return rows;
  }

  /** Identificador mais comum entre os modelos do protocolo: palpite para modelo novo vindo da lista do Traccar. */
  async identificadorDoProtocolo(protocolo: string): Promise<RastreadorModeloEntity['tipo_identificador'] | null> {
    const { rows } = await this.pool.query<{ tipo_identificador: RastreadorModeloEntity['tipo_identificador'] }>(
      `select tipo_identificador from rastreador_modelos where protocolo = $1 and ativo
        group by 1 order by count(*) desc, tipo_identificador limit 1`,
      [protocolo],
    );
    return rows[0]?.tipo_identificador ?? null;
  }

  async atualizar(id: string, d: Partial<ModeloDados & { ativo: boolean }>, executor: Queryable = this.pool): Promise<RastreadorModeloEntity | null> {
    const campos = (['fabricante', 'nome', 'protocolo', 'porta', 'tipo_identificador', 'atributo_tensao', 'sinal_max', 'atributo_bloqueio', 'ativo'] as const).filter(
      (k) => d[k] !== undefined,
    );
    if (!campos.length) return this.findById(id, executor);
    // nomes de coluna vêm da lista fixa acima, nunca do corpo da requisição
    const sets = campos.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await executor.query<RastreadorModeloEntity>(
      `update rastreador_modelos set ${sets}, atualizado_em = now() where id = $1 returning *`,
      [id, ...campos.map((k) => d[k])],
    );
    return rows[0] ?? null;
  }

  /**
   * Últimos atributos que os rastreadores do modelo mandaram (o que o Traccar decodificou), para configurar o
   * mapeamento da telemetria olhando o dado real. Um por rastreador, os de comunicação mais recente primeiro.
   */
  async atributosRecebidos(id: string, limite = 5) {
    const { rows } = await this.pool.query<{ imei: string; protocolo: string | null; atributos: Record<string, unknown>; atributos_em: Date | null }>(
      `select r.imei, r.protocolo, rc.ultimos_atributos as atributos, rc.atributos_em
         from rastreadores r join rastreador_comunicacao rc on rc.rastreador_id = r.id
        where r.modelo_id = $1 and rc.atributos_em is not null
        order by rc.atributos_em desc limit $2`,
      [id, limite],
    );
    return rows;
  }

  /** Rastreador com o modelo e a última comunicação — base do diagnóstico (checklist da tela). */
  async estadoDoRastreador(rastreadorId: string) {
    const { rows } = await this.pool.query<EstadoRastreadorRow>(
      `select r.id, r.imei, r.status, r.protocolo, r.traccar_device_id, r.modelo_id,
              rc.ultimo_pacote_em, rc.ultimos_atributos, rc.atributos_em, m.atributo_tensao, m.sinal_max, m.atributo_bloqueio,
              ${COLUNAS_ULTIMA_POSICAO}
         from rastreadores r
         left join rastreador_comunicacao rc on rc.rastreador_id = r.id
         left join rastreador_modelos m on m.id = r.modelo_id
         left join ultima_posicao up on up.rastreador_id = r.id
        where r.id = $1`,
      [rastreadorId],
    );
    return rows[0] ?? null;
  }

  /**
   * O que cada rastreador não desativado está transmitindo (aba Transmissão do Console): comunicação, última posição
   * válida, últimos atributos e quantos pacotes chegaram na última hora. Cruza clientes de propósito — rota só de
   * superadmin. A contagem usa `server_time` (quando o Traccar recebeu), não `fix_time`: pacote antigo descarregado
   * agora conta como transmissão de agora; o índice (rastreador_id, fix_time) limita a varredura a dois dias.
   */
  async transmissao() {
    const { rows } = await this.pool.query<EstadoRastreadorRow & {
      modelo_fabricante: string | null; modelo_nome: string | null; modelo_protocolo: string | null; modelo_porta: number | null;
      client_name: string | null; asset_plate: string | null; ultima_posicao_valida_em: Date | null; pacotes_1h: number;
    }>(
      `select r.id, r.imei, r.status, r.protocolo, r.traccar_device_id, r.modelo_id,
              rc.ultimo_pacote_em, rc.ultima_posicao_valida_em, rc.ultimos_atributos, rc.atributos_em,
              m.atributo_tensao, m.sinal_max, m.atributo_bloqueio,
              m.fabricante as modelo_fabricante, m.nome as modelo_nome, m.protocolo as modelo_protocolo, m.porta as modelo_porta,
              c.name as client_name, a.plate as asset_plate,
              ${COLUNAS_ULTIMA_POSICAO},
              coalesce((select count(*)::int from posicoes p
                         where p.rastreador_id = r.id and p.fix_time > now() - interval '2 days'
                           and p.server_time > now() - interval '1 hour'), 0) as pacotes_1h
         from rastreadores r
         left join rastreador_comunicacao rc on rc.rastreador_id = r.id
         left join rastreador_modelos m on m.id = r.modelo_id
         left join ultima_posicao up on up.rastreador_id = r.id
         left join rastreador_vinculos v on v.rastreador_id = r.id and v.desvinculado_em is null
         left join clients c on c.id = v.client_id
         left join instalacoes i on i.rastreador_id = r.id and i.desinstalado_em is null
         left join assets a on a.id = i.asset_id
        where r.status <> 'desativado'
        order by rc.ultimo_pacote_em desc nulls last, r.criado_em desc`,
    );
    return rows;
  }

  /**
   * Um aparelho do modelo que o Traccar já conhece pelo protocolo certo (cadastrado lá e com posição recebida nesse
   * protocolo): sem posição, o Traccar não sabe o protocolo do device e responde só `custom` em /api/commands/types.
   */
  async aparelhoDeReferencia(id: string) {
    const { rows } = await this.pool.query<{ imei: string; traccar_device_id: string }>(
      `select r.imei, r.traccar_device_id
         from rastreadores r
         join rastreador_modelos m on m.id = r.modelo_id
         left join rastreador_comunicacao rc on rc.rastreador_id = r.id
        where r.modelo_id = $1 and r.status <> 'desativado' and r.traccar_device_id is not null and r.protocolo = m.protocolo
        order by rc.atributos_em desc nulls last limit 1`,
      [id],
    );
    return rows[0] ?? null;
  }
}
