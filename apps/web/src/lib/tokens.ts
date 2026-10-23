// Lê tokens de styles/tokens.css para bibliotecas que exigem o valor pronto (Leaflet, atributos SVG do Recharts).
// Nunca escreva cores no código: peça o token pelo nome.
export const tv = (name: string, el: Element = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

// conjunto usado pelos gráficos; leia a cada render para seguir trocas de tema/marca
export const chartTokens = () => ({
  real: tv('--real'), realSoft: tv('--real-soft'), loss: tv('--loss'), lossSoft: tv('--loss-soft'), lossInk: tv('--loss-ink'),
  target: tv('--target'), ink: tv('--ink'), ink2: tv('--ink-2'), ink3: tv('--ink-3'), line: tv('--line'), prev: tv('--prev'),
  card: tv('--card'), card2: tv('--card-2'), route: tv('--route'), warn: tv('--warn'), crit: tv('--crit'), fence: tv('--fence'), fenceFill: tv('--fence-fill'),
  fontSans: tv('--font-sans'), fontMono: tv('--font-mono'),
});
