import { describe, expect, it } from 'vitest';
import { routeStats } from '@localle/shared/routeStats';
import { blocosPorVeiculo, planilhaLinhas, secoesPdf, type BlocoVeiculo, type Ponto } from './relatorioPosicoes';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 28, 12);
// percurso: anda, para 10 min com ignição desligada, anda de novo
const percurso = (lat: number): Ponto[] => [
  [T0, lat, -34.9, 40, 1], [T0 + 1 * MIN, lat + 0.01, -34.9, 40, 1],
  [T0 + 2 * MIN, lat + 0.01, -34.9, 0, 0], [T0 + 12 * MIN, lat + 0.01, -34.9, 0, 0],
  [T0 + 13 * MIN, lat + 0.02, -34.9, 50, 1],
];
const bloco = (id: string, plate: string, pts: Ponto[]): BlocoVeiculo => ({ a: { id, name: `Veículo ${plate}`, plate }, pts, n: pts.length, stats: routeStats(pts) });

// Sprint de monitoramento 28/10/2026, bug 6: com a frota toda, as posições saíam misturadas entre veículos.
describe('relatório de posições em blocos por veículo', () => {
  // pontos chegam fora de ordem; o resumo (stats) vem pronto da API, calculado na ordem certa
  const qyx = { ...bloco('2', 'QYX5B88', percurso(-8)), pts: [...percurso(-8)].reverse() };
  const abc = bloco('1', 'ABC1D23', percurso(-7));
  const blocos = blocosPorVeiculo([qyx, abc]);

  it('um bloco por placa, em ordem de placa; pontos de cada bloco em ordem cronológica', () => {
    expect(blocos.map((b) => b.a.plate)).toEqual(['ABC1D23', 'QYX5B88']);
    for (const b of blocos) expect(b.pts.map((p) => p[0])).toEqual([...b.pts.map((p) => p[0])].sort((x, y) => x - y));
  });

  it('PDF: para cada veículo, resumo → paradas → posições, sem misturar placas', () => {
    const titulos = secoesPdf(blocos).map((s) => s.title);
    expect(titulos).toEqual([
      'ABC1D23 · Veículo ABC1D23 — resumo do período', 'ABC1D23 · Veículo ABC1D23 — paradas', 'ABC1D23 · Veículo ABC1D23 — posições',
      'QYX5B88 · Veículo QYX5B88 — resumo do período', 'QYX5B88 · Veículo QYX5B88 — paradas', 'QYX5B88 · Veículo QYX5B88 — posições',
    ]);
    const [resumo, paradas, posicoes] = secoesPdf(blocos);
    expect(resumo.rows[0][0]).toBe(5); // posições
    expect(resumo.rows[0][5]).toBe(1); // a parada de 10 min
    expect(paradas.rows).toHaveLength(1);
    expect(posicoes.rows).toHaveLength(5);
  });

  it('planilha: linhas de um veículo inteiras antes do próximo', () => {
    const placas = planilhaLinhas(blocos).map((l) => l[0]);
    expect(placas).toEqual([...Array(5).fill('ABC1D23'), ...Array(5).fill('QYX5B88')]);
  });

  it('veículo sem pontos carregados (frota grande) ainda tem bloco, com aviso no lugar da lista', () => {
    const sem = { ...abc, pts: [] as Ponto[] };
    const secoes = secoesPdf([sem]);
    expect(secoes.at(-1)!.rows[0][0]).toMatch(/não carregadas/);
  });
});

describe('Excel do relatório de posições', () => {
  it('abas de resumo e paradas com placa e veículo, na ordem dos blocos', async () => {
    const { paradasPlanilha, resumoPlanilha, PARADAS_PLANILHA_HEAD, RESUMO_PLANILHA_HEAD } = await import('./relatorioPosicoes');
    const b = blocosPorVeiculo([bloco('2', 'QYX5B88', percurso(-8)), bloco('1', 'ABC1D23', percurso(-7))]);
    expect(resumoPlanilha(b).map((l) => l[0])).toEqual(['ABC1D23', 'QYX5B88']);
    expect(resumoPlanilha(b)[0]).toHaveLength(RESUMO_PLANILHA_HEAD.length);
    expect(paradasPlanilha(b).map((l) => l[0])).toEqual(['ABC1D23', 'QYX5B88']);
    expect(paradasPlanilha(b)[0]).toHaveLength(PARADAS_PLANILHA_HEAD.length);
  });
});
