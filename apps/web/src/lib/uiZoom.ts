// Escala da interface (sprint de monitoramento 28/10/2026, bug 7): em notebook e monitor a plataforma abre a 90%
// (`zoom` no <html>, styles/base.css). Com `zoom`, getBoundingClientRect/clientX/innerWidth vêm na escala da tela e
// `style.top/left` e as larguras de layout na escala da página: quem posiciona algo pela tela converte por aqui.
export function uiZoom(): number {
  if (typeof document === 'undefined') return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z > 0 ? z : 1;
}

/** Retângulo do elemento em px da página (o que `style.left/top/width` espera). */
export function rectUi(el: Element) {
  const r = el.getBoundingClientRect(), z = uiZoom();
  return { left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z };
}

/** Tamanho da janela em px da página. */
export function viewportUi() {
  const z = uiZoom();
  return { w: window.innerWidth / z, h: window.innerHeight / z };
}

/** Coordenada de tela (clientX/clientY, retângulo) → px da página. */
export const paraUi = (v: number) => v / uiZoom();
