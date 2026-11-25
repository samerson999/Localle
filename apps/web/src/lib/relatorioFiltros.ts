// Filtros comuns das telas de relatório (Posições, Uso da frota, Velocidade, Cercas, Passou por aqui). Puro, testado em
// relatorioFiltros.test.ts; o estado da tela fica em useFiltrosRelatorio.ts.

/** Campos do veículo que a busca dos relatórios olha. */
export const camposDoVeiculo = (a: any) => [a?.name, a?.plate, a?.apelido];

/** Instante de um campo datetime-local. Campo apagado ou incompleto vale a `reserva` (antes a tela quebrava). */
export function instante(valor: string, reserva: number) {
  const t = new Date(valor).getTime();
  return Number.isFinite(t) ? t : reserva;
}

/** Veículos do grupo escolhido (sem grupo: todos). O campo "Veículos" oferece só esses. */
export const veiculosDoGrupo = <T extends { groupIds?: string[] }>(assets: T[], grp: string) => (grp ? assets.filter((a) => a.groupIds?.includes(grp)) : assets);

/** Texto dos filtros no arquivo exportado e no registro do relatório, com a busca quando houver. */
export function textoFiltros(partes: (string | false | null | undefined)[], busca: string) {
  const b = busca.trim();
  return [...partes, b && `Busca: "${b}"`].filter(Boolean).join(' · ');
}
