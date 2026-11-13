// Teclado do celular (skill mobile-native). Instalado uma vez em main.tsx.
//
// O problema (iPhone): o Safari não encolhe a página quando o teclado abre — ele empurra a página inteira para cima até o
// campo ficar visível. Em tela de rolagem normal isso é o esperado; nas sobreposições presas à tela (globo do
// Monitoramento, folhas, Modal no celular), que travam a rolagem (useScrollLock), a página "sobe" levando junto o que está
// fixo, e o campo pode terminar fora da tela (no globo, a folha ainda sobe para a parada alta depois do empurrão).
// No Android, `interactive-widget=resizes-content` (index.html) faz o teclado encolher a página, e nada disso acontece.
//
// O que se faz aqui:
// 1. --teclado no <html>: quanto o teclado cobre (px), lido do visualViewport; 0 no Android (a página já encolheu) e com
//    o teclado fechado. html[data-teclado] enquanto ele está aberto. As sobreposições presas à tela usam a variável para
//    terminar acima do teclado (Sheet, Modal, globo) e a barra inferior some (base.css).
// 2. Com a rolagem travada, no iPhone: o toque num campo foca sem o Safari empurrar a página (o campo é jogado para fora
//    da tela no instante do foco e volta no quadro seguinte — mesma técnica do react-aria), a página volta ao topo se ainda
//    assim rolar, e o campo é trazido à vista dentro da própria área de rolagem quando o teclado termina de abrir.
//
// Detectar o iPhone pelo navegador é exceção consciente à regra "capacidade, não aparelho": o empurrão é comportamento do
// Safari no iOS, sem media query que o revele.

const ios = () => typeof navigator !== 'undefined' && (/iP(hone|od|ad)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const TIPOS_TEXTO = new Set(['', 'text', 'search', 'email', 'tel', 'url', 'password', 'number']);
const campoDeTexto = (el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TIPOS_TEXTO.has(el.type)) || (el instanceof HTMLElement && el.isContentEditable);

function rolagemDe(el: HTMLElement | null) {
  for (el = el?.parentElement ?? null; el && el !== document.body; el = el.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

// traz o campo à vista dentro da área que rola (não a página), acima do teclado
function mostrar(campo: HTMLElement) {
  const area = rolagemDe(campo);
  const vv = window.visualViewport;
  if (!area || !vv) return;
  const r = campo.getBoundingClientRect(), a = area.getBoundingClientRect();
  const baixo = Math.min(a.bottom, vv.height + vv.offsetTop) - 16, alto = a.top + 16;
  if (r.bottom > baixo) area.scrollBy({ top: r.bottom - baixo, behavior: 'smooth' });
  else if (r.top < alto) area.scrollBy({ top: r.top - alto, behavior: 'smooth' });
}

let travado = 0;
let desfazer: (() => void) | null = null;

// chamado pelo useScrollLock: liga a proteção no primeiro bloqueio e desliga no último
export function travarTeclado(ativo: boolean) {
  if (!ios()) return;
  if (ativo) { if (travado++ === 0) desfazer = proteger(); }
  else if (--travado === 0) { desfazer?.(); desfazer = null; }
}

function proteger() {
  const aoTocar = (e: TouchEvent) => {
    const alvo = e.target;
    if (!campoDeTexto(alvo) || alvo === document.activeElement || (alvo as HTMLInputElement).disabled || (alvo as HTMLInputElement).readOnly) return;
    // foca por conta própria, com o campo fora da tela no instante do foco: o Safari não tem para onde empurrar a página
    e.preventDefault();
    const antes = alvo.style.transform;
    alvo.style.transform = 'translateY(-2000px)';
    alvo.focus({ preventScroll: true });
    requestAnimationFrame(() => { alvo.style.transform = antes; });
  };
  const aoRolar = () => { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); };
  const aoFocar = (e: FocusEvent) => {
    if (!campoDeTexto(e.target)) return;
    const campo = e.target as HTMLElement, vv = window.visualViewport;
    // teclado já aberto (troca de campo): mostra agora; senão, quando ele terminar de abrir
    if (!vv || vv.height < document.documentElement.clientHeight - 80) requestAnimationFrame(() => mostrar(campo));
    else vv.addEventListener('resize', () => requestAnimationFrame(() => mostrar(campo)), { once: true });
  };
  document.addEventListener('touchend', aoTocar, { capture: true, passive: false });
  window.addEventListener('scroll', aoRolar);
  document.addEventListener('focusin', aoFocar);
  return () => {
    document.removeEventListener('touchend', aoTocar, { capture: true });
    window.removeEventListener('scroll', aoRolar);
    document.removeEventListener('focusin', aoFocar);
  };
}

export function iniciarTeclado() {
  const vv = window.visualViewport;
  if (!vv) return;
  const raiz = document.documentElement;
  // Sonda fixa e invisível do tamanho da área onde os `fixed` se posicionam: a base dela é onde um `bottom: 0` termina de
  // fato. Antes a conta usava clientHeight (a página inteira), supondo que o `fixed` fica atrás do teclado; no PWA do
  // iPhone (13/11/2026) essa área já encolhe com o teclado, e somar --teclado por cima levantava a folha duas vezes.
  const sonda = document.createElement('div');
  sonda.setAttribute('aria-hidden', 'true');
  sonda.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1';
  document.body.appendChild(sonda);
  let quadro = 0;
  const medir = () => {
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => {
      // base do `fixed` menos a base do que se vê (vv) = o quanto o teclado cobre. O zoom de pinça também encolhe o vv,
      // mas aí a escala é > 1 e não é teclado
      const base = sonda.getBoundingClientRect().bottom;
      const cobre = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(base - vv.height - vv.offsetTop));
      const aberto = cobre > 80;
      raiz.style.setProperty('--teclado', `${aberto ? cobre : 0}px`);
      if (aberto) raiz.dataset.teclado = ''; else delete raiz.dataset.teclado;
    });
  };
  vv.addEventListener('resize', medir);
  vv.addEventListener('scroll', medir);
  window.addEventListener('resize', medir); // a área dos `fixed` pode mudar sem o vv mudar
  medir();
}
