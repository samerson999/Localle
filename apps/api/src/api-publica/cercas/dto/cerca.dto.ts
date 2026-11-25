import type { Cerca } from '../../../cercas/cerca.entity';
import type { Regra } from '../../../regras/regras.repository';

/** Geometria GeoJSON: `Point` (cerca circular, com `raioM` nas propriedades) ou `Polygon`. Coordenadas [longitude, latitude]. */
export class GeometriaDto {
  type!: 'Point' | 'Polygon';
  /** `Point`: [lon, lat]. `Polygon`: [[[lon, lat], …]] com o primeiro ponto repetido no fim. */
  coordinates!: number[] | number[][][];
}

export class PropriedadesCercaDto {
  nome!: string;
  /** Tipo cadastrado (ex.: Cliente, Base, Área de risco). */
  tipo!: string;
  /** `circulo` ou `poligono`. */
  forma!: 'circulo' | 'poligono';
  /** Só em círculo, em metros. */
  raioM!: number | null;
  alertaEntrada!: boolean;
  alertaSaida!: boolean;
  prioridadeAlerta!: 'alta' | 'media' | 'baixa' | null;
  iniciaViagem!: boolean;
  encerraViagem!: boolean;
  velocidadeLimiteKmh!: number | null;
  permanenciaMaxMin!: number | null;
}

/** Cerca como `Feature` GeoJSON. */
export class CercaDto {
  type!: 'Feature';
  id!: string;
  geometry!: GeometriaDto;
  properties!: PropriedadesCercaDto;
}

export class CondicaoRegraDto {
  /** Campo avaliado (velocidade, ignicao, bateria, horario, atributo…). */
  field!: string;
  op!: string;
  value!: string;
  /** Só em `atributo`: a chave crua do rastreador. */
  attr?: string;
}

export class AcoesRegraDto {
  painel!: boolean;
  email!: boolean;
  whatsapp!: boolean;
  motorista!: boolean;
  bloqueio!: boolean;
  ranking!: boolean;
  /** O alerta vira ocorrência, encerrada com desfecho. */
  tratamento!: boolean;
}

/** Regra de alerta configurada pelo cliente. */
export class RegraDto {
  id!: string;
  nome!: string;
  ativa!: boolean;
  prioridade!: 'alta' | 'media' | 'baixa';
  /** Todas precisam valer para disparar. */
  condicoes!: CondicaoRegraDto[];
  acoes!: AcoesRegraDto;
  /** Disparos nos últimos 30 dias. */
  disparos30d!: number;
}

export class PaginaCercas {
  dados!: CercaDto[];
  proximoCursor!: string | null;
}
export class PaginaRegras {
  dados!: RegraDto[];
  proximoCursor!: string | null;
}

/** A tela guarda [lat, lon]; GeoJSON é [lon, lat]. */
const lonLat = ([lat, lon]: [number, number]) => [lon, lat];

export function paraCercaDto(c: Cerca): CercaDto {
  let geometry: GeometriaDto;
  if (c.forma === 'circulo' && c.centro) {
    geometry = { type: 'Point', coordinates: lonLat(c.centro) };
  } else {
    const anel = (c.pontos ?? []).map(lonLat);
    const [p0, ult] = [anel[0], anel[anel.length - 1]];
    if (p0 && (p0[0] !== ult[0] || p0[1] !== ult[1])) anel.push(p0);
    geometry = { type: 'Polygon', coordinates: [anel] };
  }
  return {
    type: 'Feature',
    id: c.id,
    geometry,
    properties: {
      nome: c.nome,
      tipo: c.tipo,
      forma: c.forma,
      raioM: c.raioM,
      alertaEntrada: c.alertaEntrada,
      alertaSaida: c.alertaSaida,
      prioridadeAlerta: c.prioridadeAlerta,
      iniciaViagem: c.iniciaViagem,
      encerraViagem: c.encerraViagem,
      velocidadeLimiteKmh: c.velocidadeLimiteKmh,
      permanenciaMaxMin: c.permanenciaMaxMin,
    },
  };
}

export const paraRegraDto = (r: Regra): RegraDto => ({
  id: r.id,
  nome: r.nome,
  ativa: r.ativa,
  prioridade: r.prioridade,
  condicoes: r.condicoes.map((c) => ({ field: c.field, op: c.op, value: c.value, ...(c.attr ? { attr: c.attr } : {}) })),
  acoes: { ...r.acoes },
  disparos30d: r.disparos30d,
});
