import type { ComunicacaoStatus, Telemetria } from '@localle/shared/realtime';
import type { CurrentPositionRow, EventoRow, HistoryPositionRow } from '../../../monitoring/monitoring.repository';
import { iso } from '../../comum/periodo';

/** Últimas leituras do rastreador (cada uma é o último valor conhecido, que pode ser de antes da posição atual). */
export class LeiturasDto {
  /** Tensão da bateria do veículo, em volts. */
  tensaoV!: number | null;
  /** `false`: alimentação do veículo cortada, rastreador na bateria interna. */
  alimentacaoExterna!: boolean | null;
  bloqueado!: boolean | null;
  satelites!: number | null;
  /** Sinal da rede celular, de 0 a 5. */
  sinalGsm!: number | null;
  /** Odômetro do painel (rede CAN), em km; só aparelho com CAN. */
  odometroPainelKm!: number | null;
}

/** Situação atual de um veículo ativo. */
export class PosicaoAtualDto {
  veiculoId!: string;
  placa!: string | null;
  nome!: string;
  /** Instante da última posição válida, ISO 8601 (UTC); `null` enquanto o veículo não tem posição. */
  dataHora!: string | null;
  latitude!: number | null;
  longitude!: number | null;
  velocidadeKmh!: number | null;
  ignicao!: boolean | null;
  /** `online`, `sem_gps`, `sem_sinal`, `aguardando` (instalado, sem pacote ainda) ou `sem_rastreador`. */
  comunicacao!: ComunicacaoStatus;
  /** Último pacote recebido do rastreador, ISO 8601 (UTC). */
  ultimoPacoteEm!: string | null;
  leituras!: LeiturasDto;
}

/** Posição do histórico de um veículo. */
export class PosicaoDto {
  /** ISO 8601 (UTC). */
  dataHora!: string;
  latitude!: number;
  longitude!: number;
  velocidadeKmh!: number | null;
  /** Rumo em graus (0 = norte). */
  rumo!: number | null;
  ignicao!: boolean | null;
  /** `false`: posição sem fixação de GPS (o aparelho repetiu a última conhecida). */
  valida!: boolean;
}

/** Evento do rastreador (ignição, alarme, SOS, cerca…). */
export class EventoDto {
  id!: string;
  veiculoId!: string | null;
  placa!: string | null;
  tipo!: string;
  /** De onde veio: o rastreador ou a plataforma. */
  origem!: string;
  /** ISO 8601 (UTC). */
  dataHora!: string;
  latitude!: number | null;
  longitude!: number | null;
  velocidadeKmh!: number | null;
  /** Atributos crus do rastreador no evento (variam por modelo). */
  atributos!: Record<string, unknown>;
}

export class PaginaPosicoesAtuais {
  dados!: PosicaoAtualDto[];
  proximoCursor!: string | null;
}
export class PaginaPosicoes {
  dados!: PosicaoDto[];
  /** Passe em `cursor` para a próxima página; `null` na última. */
  proximoCursor!: string | null;
}
export class PaginaEventos {
  dados!: EventoDto[];
  /** Passe em `cursor` para a próxima página; `null` na última. */
  proximoCursor!: string | null;
}

export const paraPosicaoAtualDto = (r: CurrentPositionRow, comunicacao: ComunicacaoStatus, t: Telemetria): PosicaoAtualDto => ({
  veiculoId: r.asset_id,
  placa: r.plate,
  nome: r.rotulo,
  dataHora: iso(r.fix_time),
  latitude: r.latitude,
  longitude: r.longitude,
  velocidadeKmh: r.speed_kmh,
  ignicao: r.ignition,
  comunicacao,
  ultimoPacoteEm: iso(r.ultimo_pacote_em),
  leituras: {
    tensaoV: t.tensaoV,
    alimentacaoExterna: t.alimentacaoExterna,
    bloqueado: t.bloqueado,
    satelites: t.satelites,
    sinalGsm: t.sinalGsm,
    odometroPainelKm: t.odometroPainelKm ?? null,
  },
});

export const paraPosicaoDto = (r: HistoryPositionRow): PosicaoDto => ({
  dataHora: iso(r.fix_time)!,
  latitude: r.latitude,
  longitude: r.longitude,
  velocidadeKmh: r.speed_kmh,
  rumo: r.course,
  ignicao: r.ignition,
  valida: r.valid,
});

export const paraEventoDto = (r: EventoRow): EventoDto => ({
  id: String(r.id),
  veiculoId: r.asset_id,
  placa: r.plate,
  tipo: r.tipo,
  origem: r.origem,
  dataHora: iso(r.ts)!,
  latitude: r.latitude,
  longitude: r.longitude,
  velocidadeKmh: r.speed_kmh,
  atributos: r.attributes ?? {},
});
