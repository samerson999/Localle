// Busca de texto das telas (listas e relatórios): sem acento, sem maiúsculas e com placa sem hífen. Testada em
// relatorioFiltros.test.ts.

/** Sem acento e em minúsculas: "Avançar" casa com "avancar". */
export const normalizar = (s: string | null | undefined) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const compacto = (s: string | null | undefined) => normalizar(s).replace(/[^a-z0-9]/g, '');

/** A busca casa com algum dos campos; placa sem hífen ("abc1d23") casa com "ABC-1D23". Busca vazia casa com tudo. */
export function casaBusca(busca: string, ...campos: (string | null | undefined)[]) {
  const t = normalizar(busca.trim());
  if (!t) return true;
  const c = compacto(t);
  return campos.some((x) => normalizar(x).includes(t) || (!!c && compacto(x).includes(c)));
}
