import type { FencePassage } from '@localle/shared/fenceStats';
import type { NearbyPass } from '@localle/shared/nearbyStats';
import type { RouteStats } from '@localle/shared/routeStats';
import type { SpeedLeg } from '@localle/shared/speedStats';

const isoMs = (ms: number) => new Date(ms).toISOString();
const minutos = (ms: number) => Math.round((ms / 60_000) * 10) / 10;
const ponto = ([lat, lon]: [number, number]) => ({ latitude: lat, longitude: lon });

export class PontoDto {
  latitude!: number;
  longitude!: number;
}

/** Quilometragem do veículo no período, pelo odômetro (CAN ou GPS acumulado do rastreador). */
export class QuilometragemDto {
  veiculoId!: string;
  /** Primeira leitura do período, ISO 8601 (UTC); `null` sem leitura. */
  primeiraLeitura!: string | null;
  /** Última leitura do período, ISO 8601 (UTC). */
  ultimaLeitura!: string | null;
  distanciaKm!: number | null;
  /** Leituras usadas no cálculo. */
  amostras!: number;
}

export class EpisodioDto {
  /** ISO 8601 (UTC). */
  inicio!: string;
  /** ISO 8601 (UTC). */
  fim!: string;
  duracaoMin!: number;
  /** Só em excessos de velocidade. */
  velocidadeMaxKmh?: number;
  amostras!: number;
}

/** Episódios de um veículo (excessos acima do limite configurado, ou paradas acima da duração mínima). */
export class EpisodiosDto {
  veiculoId!: string;
  /** Só em excessos: o limite aplicado ao veículo, em km/h. */
  limiteKmh?: number;
  episodios!: EpisodioDto[];
}

export class TrechoVelocidadeDto {
  /** ISO 8601 (UTC). */
  inicio!: string;
  /** ISO 8601 (UTC). */
  fim!: string;
  velocidadeMaxKmh!: number;
  velocidadeMediaKmh!: number;
  localInicio!: PontoDto;
  localFim!: PontoDto;
  localVelocidadeMax!: PontoDto;
}

export class VelocidadeVeiculoDto {
  veiculoId!: string;
  placa!: string;
  /** Trechos contínuos na velocidade mínima pedida ou acima. */
  trechos!: TrechoVelocidadeDto[];
}

export class ParadaPercursoDto {
  /** ISO 8601 (UTC). */
  inicio!: string;
  /** ISO 8601 (UTC). */
  fim!: string;
  local!: PontoDto;
  /** Ignição na parada; `null` se o rastreador não informa. */
  ignicao!: boolean | null;
}

/** Resumo do percurso do veículo no período, calculado sobre as posições. */
export class PercursoDto {
  veiculoId!: string;
  posicoes!: number;
  distanciaKm!: number;
  emMovimentoMin!: number;
  /** `null` se o rastreador não informa ignição. */
  motorLigadoMin!: number | null;
  /** Parado com o motor ligado; `null` se o rastreador não informa ignição. */
  ociosoMin!: number | null;
  velocidadeMaxKmh!: number;
  paradas!: ParadaPercursoDto[];
}

export class PassagemCercaDto {
  cercaId!: string;
  cerca!: string;
  tipoCerca!: string;
  /** ISO 8601 (UTC). */
  entrada!: string;
  /** ISO 8601 (UTC); `null` se ainda estava na cerca no fim do período. */
  saida!: string | null;
  permanenciaMin!: number | null;
  /** Ficou mais de 30 min sem posição dentro da cerca (provável perda de sinal). */
  semSinalDentro!: boolean;
}

export class CercasVeiculoDto {
  veiculoId!: string;
  placa!: string;
  passagens!: PassagemCercaDto[];
}

export class PassagemPontoDto {
  /** ISO 8601 (UTC). */
  entrada!: string;
  /** ISO 8601 (UTC). */
  saida!: string;
  /** Menor distância ao ponto, em metros. */
  distanciaMinM!: number;
  localMaisProximo!: PontoDto;
  velocidadeNoPontoKmh!: number;
}

export class PassouPorAquiVeiculoDto {
  veiculoId!: string;
  placa!: string;
  passagens!: PassagemPontoDto[];
}

/** Uso de um veículo num dia (dia no fuso da operação, America/Recife). */
export class UsoDiaDto {
  veiculoId!: string;
  /** `YYYY-MM-DD`. */
  dia!: string;
  distanciaKm!: number;
  emMovimentoMin!: number;
}

export class PaginaVelocidade {
  dados!: VelocidadeVeiculoDto[];
  proximoCursor!: string | null;
}
export class PaginaCercasRelatorio {
  dados!: CercasVeiculoDto[];
  proximoCursor!: string | null;
}
export class PaginaPassouPorAqui {
  dados!: PassouPorAquiVeiculoDto[];
  proximoCursor!: string | null;
}
export class PaginaUso {
  dados!: UsoDiaDto[];
  proximoCursor!: string | null;
}

export const paraTrecho = (l: SpeedLeg): TrechoVelocidadeDto => ({
  inicio: isoMs(l.start),
  fim: isoMs(l.end),
  velocidadeMaxKmh: l.vmax,
  velocidadeMediaKmh: Math.round(l.vavg * 10) / 10,
  localInicio: ponto(l.startPos),
  localFim: ponto(l.endPos),
  localVelocidadeMax: ponto(l.maxPos),
});

export const paraPercurso = (veiculoId: string, posicoes: number, s: RouteStats): PercursoDto => ({
  veiculoId,
  posicoes,
  distanciaKm: Math.round(s.dist * 100) / 100,
  emMovimentoMin: minutos(s.moving),
  motorLigadoMin: s.engineOn === null ? null : minutos(s.engineOn),
  ociosoMin: s.idle === null ? null : minutos(s.idle),
  velocidadeMaxKmh: s.vmax,
  paradas: s.stops.map((p) => ({ inicio: isoMs(p.ts), fim: isoMs(p.end), local: ponto(p.pos), ignicao: p.ignition })),
});

export const paraPassagemCerca = (p: FencePassage & { fenceName: string; fenceType: string }): PassagemCercaDto => ({
  cercaId: p.fenceId,
  cerca: p.fenceName,
  tipoCerca: p.fenceType,
  entrada: isoMs(p.enter),
  saida: p.exit === null ? null : isoMs(p.exit),
  permanenciaMin: p.exit === null ? null : minutos(p.exit - p.enter),
  semSinalDentro: p.gapFlagged,
});

export const paraPassagemPonto = (p: NearbyPass): PassagemPontoDto => ({
  entrada: isoMs(p.enter),
  saida: isoMs(p.exit),
  distanciaMinM: Math.round(p.minDist),
  localMaisProximo: ponto(p.minDistPos),
  velocidadeNoPontoKmh: p.speedAtClosest,
});
