// Duração CSS ("280ms", ".28s") em milissegundos. O build minifica "280ms" para ".28s": ler só o número dava 0,28 ms
// na HML e o usePresence desmontava a tela sem animar a saída (no `pnpm dev` o CSS não é minificado e funcionava).
export function duracaoMs(v: string): number {
  const t = v.trim();
  const n = parseFloat(t);
  if (Number.isNaN(n)) return NaN;
  return t.endsWith('ms') ? n : t.endsWith('s') ? n * 1000 : n;
}
