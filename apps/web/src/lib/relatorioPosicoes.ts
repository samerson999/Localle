// Relatório de Posições em blocos por veículo (sprint de monitoramento 28/10/2026, bug 6): com a frota toda, as
// posições saíam numa lista só, com os veículos misturados. Cada bloco traz o veículo completo, em ordem cronológica,
// com o resumo de movimento e as paradas; tela, PDF e planilha seguem a mesma ordem de blocos.
import type { RouteStats } from '@localle/shared/routeStats';
import { fmtDT, hm } from '@localle/shared/utils';
import type { PdfSection } from './reportExport';
import { cachedAddress, fmtCoord } from './geocode';

/** Ponto do percurso: [ts, lat, lng, km/h, ignição 0/1]. */
export type Ponto = [number, number, number, number, number];
export interface BlocoVeiculo { a: { id: string; name: string; plate?: string }; pts: Ponto[]; n: number; stats: RouteStats }

/** Um bloco por veículo, ordenado pela placa (depois pelo nome); pontos de cada um em ordem cronológica. */
export function blocosPorVeiculo<T extends BlocoVeiculo>(lista: T[]): T[] {
  const chave = (b: T) => (b.a.plate || b.a.name || '').toUpperCase();
  return [...lista]
    .sort((x, y) => chave(x).localeCompare(chave(y), 'pt-BR') || x.a.id.localeCompare(y.a.id))
    .map((b) => ({ ...b, pts: [...b.pts].sort((p, q) => p[0] - q[0]) }));
}

export const rotuloVeiculo = (a: BlocoVeiculo['a']) => (a.plate && a.plate !== a.name ? `${a.plate} · ${a.name}` : a.name || a.plate || '—');

export const RESUMO_HEAD = ['Posições', 'Distância', 'Vel. máxima', 'Em movimento', 'Parado com ignição', 'Paradas (> 5 min)'];
export const resumoLinha = ({ n, stats }: BlocoVeiculo) => [n, `${Math.round(stats.dist)} km`, `${Math.round(stats.vmax)} km/h`, hm(stats.moving), hm(stats.idle), stats.stops.length];

export const PARADAS_HEAD = ['Início', 'Fim', 'Duração', 'Ignição', 'Endereço'];
export const paradasLinhas = ({ stats }: BlocoVeiculo) =>
  stats.stops.map((s) => [fmtDT(s.ts), fmtDT(s.end), hm(s.end - s.ts), s.ignition ? 'Ligada' : 'Desligada', cachedAddress(s.pos[0], s.pos[1])]);

export const POSICOES_HEAD = ['Data/hora', 'Velocidade (km/h)', 'Ignição', 'Endereço', 'Latitude', 'Longitude'];
export const posicoesLinhas = ({ pts }: BlocoVeiculo) =>
  pts.map((p) => [fmtDT(p[0]), Math.round(p[3]), p[4] ? 'Ligada' : 'Desligada', cachedAddress(p[1], p[2]), fmtCoord(p[1]), fmtCoord(p[2])]);

/** Seções do PDF: para cada veículo, resumo, paradas e posições, em sequência. */
export function secoesPdf(blocos: BlocoVeiculo[]): PdfSection[] {
  return blocos.flatMap((b) => {
    const r = rotuloVeiculo(b.a);
    return [
      { title: `${r} — resumo do período`, head: RESUMO_HEAD, rows: [resumoLinha(b)] },
      ...(b.stats.stops.length ? [{ title: `${r} — paradas`, head: PARADAS_HEAD, rows: paradasLinhas(b) }] : []),
      {
        title: `${r} — posições`,
        head: POSICOES_HEAD,
        rows: b.pts.length ? posicoesLinhas(b) : [['Posições não carregadas: filtre por grupo ou veículo para ver a lista.', '', '', '', '', '']],
      },
    ];
  });
}

/** Excel: paradas de todos os veículos numa aba, com placa e veículo, na mesma ordem dos blocos. */
export const PARADAS_PLANILHA_HEAD = ['Placa', 'Veículo', ...PARADAS_HEAD];
export const paradasPlanilha = (blocos: BlocoVeiculo[]) => blocos.flatMap((b) => paradasLinhas(b).map((l) => [b.a.plate || '', b.a.name, ...l]));
export const RESUMO_PLANILHA_HEAD = ['Placa', 'Veículo', ...RESUMO_HEAD];
export const resumoPlanilha = (blocos: BlocoVeiculo[]) => blocos.map((b) => [b.a.plate || '', b.a.name, ...resumoLinha(b)]);

/** Planilha (CSV/Excel): uma linha por posição com placa e veículo, blocos em sequência. */
export const PLANILHA_HEAD = ['Placa', 'Veículo', ...POSICOES_HEAD];
export const planilhaLinhas = (blocos: BlocoVeiculo[]) => blocos.flatMap((b) => posicoesLinhas(b).map((l) => [b.a.plate || '', b.a.name, ...l]));
