// Altura livre da janela abaixo do topo de uma linha (px da interface: o <html> tem zoom, lib/uiZoom), para as telas de
// trabalho com mapa — Monitoramento, Cercas, Replay — caberem na janela sem rolar até o fim do mapa. Antes cada uma usava
// 100vh menos um número fixo (128px) com piso de 560px, que não contava o que fica acima (cabeçalho, KPIs, avisos) e, em
// notebook, passava do fim da janela.
//
// Devolve null — e a tela fica com a altura natural dela — abaixo de md (o celular tem o próprio desenho), com `ativo`
// falso e quando a linha quebrou (janela estreita: os itens ficam um embaixo do outro e cada um com a altura da janela
// obrigaria a rolar de qualquer jeito). Remede ao mudar a janela e quando algo acima muda de altura.
import { useLayoutEffect, useState, type RefObject } from 'react';
import { paraUi, rectUi, viewportUi } from './uiZoom';

const MD = '(min-width: 768px)';

// itens da linha, atravessando os wrappers com display: contents
function itens(el: Element): HTMLElement[] {
  return [...el.children].flatMap((c) => (getComputedStyle(c).display === 'contents' ? itens(c) : c instanceof HTMLElement && c.offsetParent ? [c] : []));
}

export function useAlturaLivre(ref: RefObject<HTMLElement>, { ativo = true, min = 360, folga = 24 }: { ativo?: boolean; min?: number; folga?: number } = {}) {
  const [altura, setAltura] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ativo) { setAltura(null); return; }
    const medir = () => {
      if (!window.matchMedia(MD).matches) { setAltura(null); return; }
      const [a, b] = itens(el);
      if (a && b && Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) > 1) { setAltura(null); return; }
      setAltura(Math.max(min, Math.floor(viewportUi().h - (rectUi(el).top + paraUi(window.scrollY)) - folga)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', medir);
    return () => { ro.disconnect(); window.removeEventListener('resize', medir); };
  }, [ref, ativo, min, folga]);
  return altura;
}
