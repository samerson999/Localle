import { jornadaLimits, type DayCalc } from '@localle/shared/jornada';
import type { Ranking } from '@localle/shared/ranking';
import type { MarcacaoRow } from '../../../jornada/jornada.repository';
import type { EventoRow as EventoRankingRow } from '../../../ranking/ranking.repository';
import type { MatrizRow, ViagemRow } from '../../../viagens/viagens.repository';
import { iso } from '../../comum/periodo';

const min = (ms: number) => Math.round(ms / 60_000);

export class EtapasViagemDto {
  /** ISO 8601 (UTC). */
  iniciadaEm!: string | null;
  carregadaEm!: string | null;
  descarregadaEm!: string | null;
  encerradaEm!: string | null;
}

export class CercasViagemDto {
  origemId!: string | null;
  cargaId!: string | null;
  descargaId!: string | null;
  destinoId!: string | null;
}

export class ViagemDto {
  id!: string;
  /** `externo` ou `patio`. */
  tipo!: string;
  nome!: string | null;
  veiculoId!: string;
  motoristaId!: string | null;
  /** Rota-padrão de origem, quando a viagem saiu de uma. */
  rotaId!: string | null;
  carga!: string | null;
  /** `aguardando`, `em_andamento`, `encerrada`… */
  situacao!: string;
  etapas!: EtapasViagemDto;
  cercas!: CercasViagemDto;
  /** Quem marcou o início: rastreador, portaria, app ou gestor. */
  iniciadaPor!: string | null;
}

export class ParadaRotaDto {
  cercaId!: string;
  /** Horário previsto, `HH:MM`. */
  horario!: string;
}

/** Rota-padrão (matriz) de viagem. */
export class RotaDto {
  id!: string;
  nome!: string;
  veiculoId!: string | null;
  motoristaId!: string | null;
  /** Dias da semana (0 = domingo). */
  dias!: number[];
  paradas!: ParadaRotaDto[];
  ativa!: boolean;
}

export class MarcacaoDto {
  id!: string;
  motoristaId!: string;
  veiculoId!: string | null;
  /** ISO 8601 (UTC). */
  dataHora!: string;
  /** Tipo da marcação (início de jornada, refeição, direção, espera, descanso, fim…). */
  tipo!: string;
  /** `teclado`, `app`, `rastreador` ou `manual`. */
  origem!: string;
}

export class InfracaoJornadaDto {
  codigo!: string;
  descricao!: string;
  detalhe!: string;
}

/** Um dia do espelho de ponto. Tempos em minutos. */
export class DiaJornadaDto {
  /** `YYYY-MM-DD`. */
  dia!: string;
  /** ISO 8601 (UTC). */
  inicio!: string | null;
  fim!: string | null;
  trabalhadoMin!: number;
  direcaoMin!: number;
  refeicaoMin!: number;
  esperaMin!: number;
  descansoMin!: number;
  extraMin!: number;
  noturnoMin!: number;
  /** Maior direção contínua do dia. */
  maiorDirecaoContinuaMin!: number;
  /** Descanso desde a jornada anterior. */
  interjornadaMin!: number | null;
  /** Jornada ainda aberta (sem fim marcado). */
  aberto!: boolean;
  infracoes!: InfracaoJornadaDto[];
}

/** Limites aplicados no espelho: a lei é piso, o Setup do cliente só endurece. Em minutos. */
export class LimitesJornadaDto {
  jornadaBaseMin!: number;
  extrasMaxMin!: number;
  refeicaoMin!: number;
  interjornadaMin!: number;
  descansoSemanalMin!: number;
  /** Direção contínua máxima do regime do motorista. */
  direcaoContinuaMaxMin!: number;
}

export class EspelhoDto {
  motoristaId!: string;
  /** `cargas` ou `passageiros`. */
  regime!: string;
  limites!: LimitesJornadaDto;
  dias!: DiaJornadaDto[];
}

export class PontuacaoPorTipoDto {
  tipo!: string;
  descricao!: string;
  categoria!: string;
  quantidade!: number;
  pontos!: number;
}

export class PosicaoRankingDto {
  motoristaId!: string;
  nome!: string;
  /** Menos é melhor. */
  pontos!: number;
  eventos!: number;
  km!: number;
  pontosPor100km!: number | null;
  /** Passou do limite de pontos do período. */
  atencao!: boolean;
  porTipo!: PontuacaoPorTipoDto[];
}

export class RankingDto {
  /** Limite de pontos configurado e o período a que se refere. */
  limitePontos!: number;
  periodoDoLimite!: string;
  /** Limite proporcional ao período consultado. */
  limiteNoPeriodo!: number;
  dias!: number;
  /** Do melhor (menos pontos) para o pior. */
  motoristas!: PosicaoRankingDto[];
}

export class EventoRankingDto {
  id!: string;
  motoristaId!: string;
  veiculoId!: string | null;
  /** ISO 8601 (UTC). */
  dataHora!: string;
  tipo!: string;
  /** Medida do evento, quando houver (ex.: velocidade). */
  valor!: number | null;
  origem!: string;
}

export class PaginaViagens {
  dados!: ViagemDto[];
  /** Passe em `cursor` para a próxima página; `null` na última. */
  proximoCursor!: string | null;
}
export class PaginaRotas {
  dados!: RotaDto[];
  proximoCursor!: string | null;
}
export class PaginaMarcacoes {
  dados!: MarcacaoDto[];
  /** Passe em `cursor` para a próxima página; `null` na última. */
  proximoCursor!: string | null;
}
export class PaginaEventosRanking {
  dados!: EventoRankingDto[];
  /** Passe em `cursor` para a próxima página; `null` na última. */
  proximoCursor!: string | null;
}

export const paraViagemDto = (v: ViagemRow): ViagemDto => ({
  id: v.id,
  tipo: v.tipo,
  nome: v.nome,
  veiculoId: v.asset_id,
  motoristaId: v.motorista_id,
  rotaId: v.matriz_id,
  carga: v.carga,
  situacao: v.status,
  etapas: { iniciadaEm: iso(v.iniciada_em), carregadaEm: iso(v.carregada_em), descarregadaEm: iso(v.descarregada_em), encerradaEm: iso(v.encerrada_em) },
  cercas: { origemId: v.origem_cerca_id, cargaId: v.carga_cerca_id, descargaId: v.descarga_cerca_id, destinoId: v.destino_cerca_id },
  iniciadaPor: v.origem_inicio,
});

export const paraRotaDto = (m: MatrizRow): RotaDto => ({
  id: m.id,
  nome: m.nome,
  veiculoId: m.asset_id,
  motoristaId: m.motorista_id,
  dias: m.dias,
  paradas: (m.paradas ?? []).map((p) => ({ cercaId: p.fenceId, horario: p.time })),
  ativa: m.ativa,
});

export const paraMarcacaoDto = (m: MarcacaoRow): MarcacaoDto => ({
  id: m.id,
  motoristaId: m.motorista_id,
  veiculoId: m.asset_id,
  dataHora: m.ts.toISOString(),
  tipo: m.tipo,
  origem: m.origem,
});

export const paraDiaJornadaDto = (d: DayCalc): DiaJornadaDto => ({
  dia: new Date(d.day).toISOString().slice(0, 10),
  inicio: d.start ? new Date(d.start).toISOString() : null,
  fim: d.end ? new Date(d.end).toISOString() : null,
  trabalhadoMin: min(d.worked),
  direcaoMin: min(d.driving),
  refeicaoMin: min(d.meal),
  esperaMin: min(d.wait),
  descansoMin: min(d.rest),
  extraMin: min(d.extra),
  noturnoMin: min(d.night),
  maiorDirecaoContinuaMin: min(d.maxCont),
  interjornadaMin: d.interjornada === undefined ? null : min(d.interjornada),
  aberto: d.open,
  infracoes: d.violations.map((v) => ({ codigo: v.code, descricao: v.label, detalhe: v.detail })),
});

export const paraRankingDto = (r: Ranking): RankingDto => ({
  limitePontos: r.limit,
  periodoDoLimite: r.limit_period,
  limiteNoPeriodo: r.limit_scaled,
  dias: Math.round(r.days * 10) / 10,
  motoristas: r.drivers.map((d) => ({
    motoristaId: d.person_id,
    nome: d.name,
    pontos: d.points,
    eventos: d.events,
    km: Math.round(d.km * 10) / 10,
    pontosPor100km: d.points_per_100km,
    atencao: d.attention,
    porTipo: d.by_code.map((b) => ({ tipo: b.code, descricao: b.label, categoria: b.category, quantidade: b.qty, pontos: b.points })),
  })),
});

export const paraEventoRankingDto = (e: EventoRankingRow): EventoRankingDto => ({
  id: e.id,
  motoristaId: e.motorista_id,
  veiculoId: e.asset_id,
  dataHora: e.ts.toISOString(),
  tipo: e.tipo,
  valor: e.valor === null ? null : Number(e.valor),
  origem: e.origem,
});

/** Limites do Setup (em horas) → efetivos de `jornadaLimits` (lei como piso) → minutos. */
export function paraLimitesDto(setup: Record<string, number>, regime: string): LimitesJornadaDto {
  const l = jornadaLimits(setup);
  return {
    jornadaBaseMin: min(l.base),
    extrasMaxMin: Math.round(l.maxExtraH * 60),
    refeicaoMin: min(l.meal),
    interjornadaMin: min(l.inter),
    descansoSemanalMin: min(l.weekly),
    direcaoContinuaMaxMin: min(regime === 'passageiros' ? l.contPassageiros : l.contCargas),
  };
}
