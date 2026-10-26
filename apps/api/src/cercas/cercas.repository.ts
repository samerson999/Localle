import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';
import type { Cerca, CercaInput } from './cerca.entity';

interface CercaRow {
  id: string;
  client_id: string;
  nome: string;
  tipo: string;
  forma: 'circulo' | 'poligono';
  centro_json: string | null;
  raio_m: string | null;
  poligono_json: string | null;
  alerta_entrada: boolean;
  alerta_saida: boolean;
  prioridade_alerta: Cerca['prioridadeAlerta'];
  inicia_viagem: boolean;
  encerra_viagem: boolean;
  velocidade_limite_kmh: string | null;
  permanencia_max_min: number | null;
}

const PG_CHECK_VIOLATION = '23514';

const SELECT = `
  select id, client_id, nome, tipo, forma,
    st_asgeojson(centro) as centro_json, raio_m, st_asgeojson(poligono) as poligono_json,
    alerta_entrada, alerta_saida, prioridade_alerta, inicia_viagem, encerra_viagem,
    velocidade_limite_kmh, permanencia_max_min
  from cercas`;

/** GeoJSON usa [lon, lat]; o front e a API usam [lat, lon]. O anel do polígono repete o 1º ponto no fim. */
function toCerca(r: CercaRow): Cerca {
  const centro = r.centro_json ? (JSON.parse(r.centro_json).coordinates as [number, number]) : null;
  const anel = r.poligono_json ? (JSON.parse(r.poligono_json).coordinates[0] as [number, number][]) : null;
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    forma: r.forma,
    centro: centro ? [centro[1], centro[0]] : null,
    raioM: r.raio_m === null ? null : Number(r.raio_m),
    pontos: anel ? anel.slice(0, -1).map(([lon, lat]) => [lat, lon]) : null,
    alertaEntrada: r.alerta_entrada,
    alertaSaida: r.alerta_saida,
    prioridadeAlerta: r.prioridade_alerta,
    iniciaViagem: r.inicia_viagem,
    encerraViagem: r.encerra_viagem,
    velocidadeLimiteKmh: r.velocidade_limite_kmh === null ? null : Number(r.velocidade_limite_kmh),
    permanenciaMaxMin: r.permanencia_max_min,
  };
}

function geojsonPoligono(pontos: [number, number][] | null): string | null {
  if (!pontos) return null;
  const anel = pontos.map(([lat, lon]) => [lon, lat]);
  return JSON.stringify({ type: 'Polygon', coordinates: [[...anel, anel[0]]] });
}

function parametros(c: CercaInput) {
  return [
    c.nome,
    c.tipo,
    c.forma,
    c.centro ? c.centro[1] : null,
    c.centro ? c.centro[0] : null,
    c.raioM,
    geojsonPoligono(c.pontos),
    c.alertaEntrada,
    c.alertaSaida,
    c.prioridadeAlerta,
    c.iniciaViagem,
    c.encerraViagem,
    c.velocidadeLimiteKmh,
    c.permanenciaMaxMin,
  ];
}

const CENTRO = `case when $5::float8 is null then null else st_setsrid(st_makepoint($5::float8, $6::float8), 4326) end`;
const POLIGONO = `case when $8::text is null then null else st_setsrid(st_geomfromgeojson($8::text), 4326) end`;

/**
 * `client_id` é sempre o primeiro filtro (mesma regra do BaseRepository); os métodos próprios existem
 * porque a geometria precisa de funções PostGIS na escrita e na leitura. Remover é lógico (`removida_em`),
 * para eventos e relatórios antigos continuarem com o nome da cerca.
 */
@Injectable()
export class CercasRepository extends BaseRepository<CercaRow> {
  protected readonly table = 'cercas';

  async listar(clientId: string): Promise<Cerca[]> {
    const { rows } = await this.pool.query<CercaRow>(`${SELECT} where client_id = $1 and removida_em is null order by nome`, [clientId]);
    return rows.map(toCerca);
  }

  async buscar(clientId: string, id: string): Promise<Cerca | null> {
    const { rows } = await this.pool.query<CercaRow>(`${SELECT} where client_id = $1 and id = $2 and removida_em is null`, [clientId, id]);
    return rows[0] ? toCerca(rows[0]) : null;
  }

  async criar(clientId: string, c: CercaInput): Promise<Cerca> {
    const { rows } = await this.executar(
      `insert into cercas (client_id, nome, tipo, forma, centro, raio_m, poligono, alerta_entrada, alerta_saida,
         prioridade_alerta, inicia_viagem, encerra_viagem, velocidade_limite_kmh, permanencia_max_min)
       values ($1, $2, $3, $4, ${CENTRO}, $7, ${POLIGONO}, $9, $10, $11, $12, $13, $14, $15)
       returning id`,
      [clientId, ...parametros(c)],
    );
    return (await this.buscar(clientId, rows[0].id))!;
  }

  async atualizar(clientId: string, id: string, c: CercaInput): Promise<Cerca | null> {
    const { rows } = await this.executar(
      `update cercas set nome = $2, tipo = $3, forma = $4, centro = ${CENTRO}, raio_m = $7, poligono = ${POLIGONO},
         alerta_entrada = $9, alerta_saida = $10, prioridade_alerta = $11, inicia_viagem = $12, encerra_viagem = $13,
         velocidade_limite_kmh = $14, permanencia_max_min = $15, atualizado_em = now()
       where client_id = $1 and id = $16 and removida_em is null
       returning id`,
      [clientId, ...parametros(c), id],
    );
    return rows[0] ? this.buscar(clientId, id) : null;
  }

  /** Também limpa a presença: sem isso, a próxima posição geraria uma "saída" de cerca que não existe mais. */
  async remover(clientId: string, id: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rowCount } = await client.query(
        'update cercas set removida_em = now() where client_id = $1 and id = $2 and removida_em is null',
        [clientId, id],
      );
      await client.query('delete from cerca_presenca where client_id = $1 and cerca_id = $2', [clientId, id]);
      await client.query('commit');
      return (rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  private async executar(sql: string, params: unknown[]) {
    try {
      return await this.pool.query<{ id: string }>(sql, params);
    } catch (err) {
      if ((err as { code?: string }).code === PG_CHECK_VIOLATION) {
        throw new BadRequestException('Geometria inválida: o polígono não pode se cruzar');
      }
      throw err;
    }
  }
}
