import type { Point } from '@localle/shared/points';
import { routeStats } from '@localle/shared/routeStats';

/**
 * Relatório de motoristas: quem dirigiu vem de `motorista_vinculos` (cartão lido pelo rastreador — a ingestão abre o
 * vínculo na leitura e encerra na ignição desligada, na troca de cartão ou na chave zerada). Cada vínculo vira um
 * "turno": da ignição ligada até a ignição desligada, sobre as posições do veículo. Os turnos do mesmo motorista no
 * mesmo veículo e no mesmo dia (dia em que o turno começou, no fuso da operação) somam numa linha do relatório.
 */

/** O cartão costuma ser lido alguns segundos depois de ligar: a ignição ligada até este tanto antes conta no turno. */
export const RECUO_IGNICAO_MS = 30 * 60_000;

export interface Janela {
  inicio: number;
  /** null = vínculo aberto (motorista ainda no veículo). */
  fim: number | null;
  /** Fim do vínculo anterior no mesmo veículo: o recuo da ignição nunca invade o turno de outro motorista. */
  piso: number;
}

export interface Turno {
  ligou: number;
  /** null = ainda ligado (vínculo aberto, ou o período acabou com o motor ligado). */
  desligou: number | null;
  pontos: Point[];
}

/**
 * Turno do vínculo sobre as posições do veículo (em ordem). Rastreador que não informa ignição: o turno vai da primeira
 * à última posição do vínculo (o motor ligado fica desconhecido, como no Uso da frota). Sem posição no vínculo: null.
 */
export function turnoDaJanela(pts: Point[], j: Janela): Turno | null {
  const fim = j.fim ?? Infinity;
  let i = pts.findIndex((p) => p[0] >= j.inicio);
  if (i < 0 || pts[i][0] > fim) return null;
  const semIgnicao = !pts.some((p, k) => k >= i && p[0] <= fim && p[4] !== null);

  if (!semIgnicao) {
    // recua enquanto a ignição já estava ligada antes da leitura do cartão
    while (i > 0 && pts[i - 1][4] === 1 && pts[i - 1][0] >= j.inicio - RECUO_IGNICAO_MS && pts[i - 1][0] > j.piso) i--;
    // começa na primeira posição com a ignição ligada
    while (i < pts.length && pts[i][0] <= fim && pts[i][4] !== 1) i++;
    if (i >= pts.length || pts[i][0] > fim) return null;
  }

  let ultimoLigado = i;
  let k = i;
  for (; k < pts.length && pts[k][0] <= fim; k++) if (semIgnicao || pts[k][4] === 1) ultimoLigado = k;
  if (semIgnicao) return { ligou: pts[i][0], desligou: j.fim === null ? null : pts[ultimoLigado][0], pontos: pts.slice(i, ultimoLigado + 1) };

  // desligou = a primeira posição com a ignição desligada depois da última ligada (é o pacote que encerra o vínculo)
  const desl = pts.findIndex((p, x) => x > ultimoLigado && p[4] === 0);
  const desligou = desl >= 0 && pts[desl][0] <= fim + 60_000 ? desl : -1;
  if (desligou >= 0) return { ligou: pts[i][0], desligou: pts[desligou][0], pontos: pts.slice(i, desligou + 1) };
  return { ligou: pts[i][0], desligou: j.fim === null ? null : pts[ultimoLigado][0], pontos: pts.slice(i, ultimoLigado + 1) };
}

export interface ResumoDoDia {
  primeiraIgnicao: number;
  /** null = o último turno do dia ainda está com o motor ligado. */
  ultimoDesligamento: number | null;
  /** Da primeira ignição ao último desligamento (ou à última posição, se ainda ligado). */
  jornadaMs: number;
  /** null = o rastreador não informa ignição. */
  motorLigadoMs: number | null;
  emMovimentoMs: number;
  /** Parado com a ignição ligada. */
  ociosoMs: number | null;
  km: number;
  /** Paradas de mais de 5 min dentro dos turnos + as pausas com a ignição desligada entre um turno e outro. */
  paradas: number;
  tempoParadoMs: number;
  ignicoes: number;
  vmax: number;
}

/** Soma os turnos (em ordem de início) de um motorista num veículo num dia. */
export function resumirDia(turnos: Turno[]): ResumoDoDia {
  const ord = [...turnos].sort((a, b) => a.ligou - b.ligou);
  const r: ResumoDoDia = {
    primeiraIgnicao: ord[0].ligou, ultimoDesligamento: null, jornadaMs: 0, motorLigadoMs: null, emMovimentoMs: 0, ociosoMs: null,
    km: 0, paradas: 0, tempoParadoMs: 0, ignicoes: ord.length, vmax: 0,
  };
  let fimAnterior: number | null = null;
  let fimDoDia = ord[0].ligou;
  for (const t of ord) {
    const s = routeStats(t.pontos);
    r.km += s.dist;
    r.emMovimentoMs += s.moving;
    r.vmax = Math.max(r.vmax, s.vmax);
    if (s.engineOn !== null) r.motorLigadoMs = (r.motorLigadoMs ?? 0) + s.engineOn;
    if (s.idle !== null) r.ociosoMs = (r.ociosoMs ?? 0) + s.idle;
    r.paradas += s.stops.length;
    r.tempoParadoMs += s.stops.reduce((x, p) => x + (p.end - p.ts), 0);
    if (fimAnterior !== null && t.ligou > fimAnterior) { r.paradas += 1; r.tempoParadoMs += t.ligou - fimAnterior; }
    const fimTurno = t.desligou ?? t.pontos[t.pontos.length - 1][0];
    fimAnterior = Math.max(fimAnterior ?? 0, fimTurno);
    fimDoDia = Math.max(fimDoDia, fimTurno);
  }
  const ultimo = ord.reduce((a, b) => ((b.desligou ?? Infinity) >= (a.desligou ?? Infinity) ? b : a));
  r.ultimoDesligamento = ultimo.desligou;
  r.jornadaMs = fimDoDia - r.primeiraIgnicao;
  return r;
}

/** 'YYYY-MM-DD' do instante no fuso dado. */
export function diaNoFuso(ms: number, fuso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date(ms));
}
