// Tema da interface (docs/pesquisa-ux/02-diretrizes-pwa-localle.md § 12.4): Claro, Escuro ou Automático (segue o sistema).
// O tema muda só os valores dos tokens: `data-theme="dark"` no <html> ativa o bloco escuro de styles/tokens.css.
// A escolha é por aparelho (localStorage); sem escolha, o padrão é o claro. O index.html aplica antes da primeira pintura.
import { useSyncExternalStore } from 'react';

export type Modo = 'claro' | 'escuro' | 'auto';
export type Tema = 'claro' | 'escuro';

const CHAVE = 'localle.tema';
const CHAVE_ANTIGA = 'localle.globo.modo'; // o globo guardava aqui antes do tema do app existir
const valido = (v: string | null): v is Modo => v === 'claro' || v === 'escuro' || v === 'auto';

function lerModo(): Modo {
  try {
    const v = localStorage.getItem(CHAVE) ?? localStorage.getItem(CHAVE_ANTIGA);
    return valido(v) ? v : 'claro';
  } catch { return 'claro'; }
}

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let modo: Modo = lerModo();
let tema: Tema = resolver();
const ouvintes = new Set<() => void>();

function resolver(): Tema { return modo === 'auto' ? (mq?.matches ? 'escuro' : 'claro') : modo; }

function aplicar() {
  tema = resolver();
  const html = document.documentElement;
  if (tema === 'escuro') html.dataset.theme = 'dark'; else delete html.dataset.theme;
  // barra do navegador/PWA acompanha o modo: mesma cor do card (topo do app)
  const cor = getComputedStyle(html).getPropertyValue('--card').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cor || '#FFFFFF');
  ouvintes.forEach((f) => f());
}

if (typeof document !== 'undefined') {
  aplicar();
  mq?.addEventListener('change', () => { if (modo === 'auto') aplicar(); });
}

export function setModo(m: Modo) {
  modo = m;
  try { localStorage.setItem(CHAVE, m); localStorage.removeItem(CHAVE_ANTIGA); } catch { /* sem armazenamento: vale só nesta visita */ }
  aplicar();
}

const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
const instantaneo = () => `${modo}|${tema}`;

export function useTema() {
  const [m, t] = useSyncExternalStore(assinar, instantaneo).split('|') as [Modo, Tema];
  return { modo: m, setModo, tema: t };
}
