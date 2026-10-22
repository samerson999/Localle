import { tv } from './tokens';
// Cor da revenda: deriva as variáveis de link, anel de foco e texto sobre a marca,
// garantindo contraste mesmo quando a revenda escolhe uma cor clara (amarelo) ou de alerta (vermelho).
const hex = (c: string) => {
  const h = c.replace('#', '');
  const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
};
const lum = (c: string) => {
  const [r, g, b] = hex(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

// escuro e claro de referência vêm dos tokens (--ink sobre --card)
const INK = () => tv('--ink');
const PAPER = () => tv('--card');
// escurece a cor em passos até atingir o contraste pedido sobre o card
function darken(c: string, min: number) {
  let [r, g, b] = hex(c);
  for (let i = 0; i < 20 && contrast(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`, PAPER()) < min; i++) [r, g, b] = [r, g, b].map((v) => Math.round(v * 0.9));
  const out = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return contrast(out, PAPER()) >= min ? out : INK();
}

// matiz saturado (graus); null se a cor for quase cinza
function hue(c: string) {
  const [r, g, b] = hex(c).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0 || d / max < 0.45) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
// vermelho saturado: confundiria a marca com o status crítico
const isRedLike = (c: string) => { const h = hue(c); return h != null && (h < 20 || h > 335); };
// laranja e amarelo: escurecidos para virar texto, ficam iguais ao texto de aviso (--warn-ink)
const isWarnLike = (c: string) => { const h = hue(c); return h != null && h >= 20 && h <= 65; };

// por que a marca caiu no grafite (null = a marca pinta): usado na prévia do /design e no Painel da revenda
export function brandFallback(color: string): string | null {
  const c = /^#[0-9a-f]{3,8}$/i.test(color || '') ? color : tv('--brand-default');
  const ink = INK(), paper = PAPER();
  if (isRedLike(c)) return 'vermelha: pareceria alerta crítico';
  if (isWarnLike(c)) return 'laranja ou amarela: pareceria atenção';
  if (contrast(c, paper) < 3) return `contraste ${contrast(c, paper).toFixed(1).replace('.', ',')}:1 sobre o card (mínimo 3:1)`;
  const fillInk = contrast(c, paper) >= contrast(c, ink) ? paper : ink;
  if (contrast(c, fillInk) < 4.5) return `texto sobre a cor com ${contrast(c, fillInk).toFixed(1).replace('.', ',')}:1 (mínimo 4,5:1)`;
  return null;
}

export function brandVars(color: string): Record<string, string> {
  const c = /^#[0-9a-f]{3,8}$/i.test(color || '') ? color : tv('--brand-default');
  const ink = INK(), paper = PAPER();
  const red = isRedLike(c);
  // botão principal e controles de seleção: a marca só pinta se passar em 3:1 sobre o card e tiver
  // texto com 4,5:1 por cima; vermelha ou laranja vira grafite mesmo passando, para não parecer alerta
  const fillInk = contrast(c, paper) >= contrast(c, ink) ? paper : ink;
  const graphite = red || isWarnLike(c) || contrast(c, paper) < 3 || contrast(c, fillInk) < 4.5;
  const fill = graphite ? tv('--graphite') : c;
  return {
    '--brand-fill': fill,
    '--brand-fill-ink': graphite ? paper : fillInk,
    '--brand-tip': graphite ? 'var(--graphite-soft)' : 'color-mix(in srgb, var(--brand-fill) 7%, white)', // card de dica
    '--brand-tip-line': graphite ? 'var(--line-strong)' : 'color-mix(in srgb, var(--brand-fill) 22%, white)',
    // derivadas repetidas aqui para recalcular onde quer que as variáveis sejam aplicadas (raiz ou prévia no /design)
    '--brand-fill-hover': 'color-mix(in srgb, var(--brand-fill) 88%, white)',
    '--brand-fill-press': 'color-mix(in srgb, var(--brand-fill) 85%, black)',
    '--brand-halo': 'color-mix(in srgb, var(--brand-fill) 22%, transparent)',
    '--brand-soft': 'color-mix(in srgb, var(--brand-fill) 5%, white)',
    '--brand-soft-line': 'color-mix(in srgb, var(--brand-fill) 25%, white)',
    '--brand': c,
    // link: na cor da revenda quando ela pinta (escurecida até 4,5:1 se preciso); grafite sublinhado no fallback
    '--brand-link': graphite ? fill : contrast(c, paper) >= 4.5 ? c : darken(c, 4.5),
    '--brand-link-decoration': graphite ? 'underline' : 'none',
    '--brand-ink': contrast(c, paper) >= contrast(c, ink) ? paper : ink, // texto sobre a cor da marca
  };
}
