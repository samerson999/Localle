// Aparência no molde da Revolut (docs/pesquisa-ux/01 e 03): paletas clara e escura da interface e do mapa, usadas pelo
// Monitoramento do celular (globo) e pela Home. O modo (Claro/Escuro/Automático) é provisório: mora no navegador até o tema do
// app existir; aí `useTema` passa a ler a preferência do usuário.
import { useEffect, useState } from 'react';

export type Kind = 'mov' | 'parado' | 'off' | 'nosignal' | 'crit';
export type Tema = 'claro' | 'escuro';
export type Paleta = {
  // colorido: usa as cores do próprio estilo (relevo do Natural Earth no globo, ruas coloridas) em vez de terra/água lisas
  estilo: string; colorido: boolean; rua: { terra: string; agua: string };
  espaco: string; terra: string; agua: string; destaque: string; destaqueOpacidade: number; destaqueBorda: string | null; aro: string;
  folha: string; cartao: string; botao: string; alca: string; texto: string; texto2: string;
  primario: string; primarioTexto: string; circulo: string; perigo: string; perigoTexto: string;
  status: Record<Kind, string>; grupo: string; grupoTexto: string;
};
export const PALETA: Record<Tema, Paleta> = {
  // escuro: medido no print da Revolut enviado em 11/11 (o doc 03 trazia terra e água trocadas e escuras demais)
  escuro: {
    estilo: 'https://tiles.openfreemap.org/styles/dark', colorido: false, rua: { terra: '#0c0c0e', agua: '#05060a' },
    espaco: '#000000', terra: '#04073A', agua: '#010005', destaque: '#B3B7C2', destaqueOpacidade: 1, destaqueBorda: null, aro: '#1A27CD',
    folha: '#1C1C1E', cartao: '#242426', botao: '#2E2E30', alca: '#3B3B3D', texto: '#F5F5F7', texto2: '#8E8E93',
    primario: '#F5F5F7', primarioTexto: '#000000', circulo: 'rgba(42,43,44,0.85)', perigo: '#FF5A4F', perigoTexto: '#000000',
    // status sobre fundo escuro: as cores do tema claro (--mov, --warn) ficam apagadas no preto; precisam de validação
    status: { mov: '#34C77B', parado: '#FF9F2E', off: '#A1A7B3', nosignal: '#6B7280', crit: '#FF5A4F' }, grupo: '#F5F5F7', grupoTexto: '#000000',
  },
  // claro: interface com os papéis invertidos (doc 03 § 4.2: página F7F7F7, bloco FFFFFF, trilho EBEBF0, botão principal quase
  // preto) e mapa colorido (pedido do usuário em 11/11: o cinza do Positron ficou apagado) — estilo Liberty, com relevo do
  // Natural Earth no globo e ruas coloridas ao aproximar. Destaque translúcido com borda, para não esconder o relevo.
  // Status com as cores do tema claro do Localle (tokens.css: --mov, --warn, --ink-2, --crit).
  claro: {
    estilo: 'https://tiles.openfreemap.org/styles/liberty', colorido: true, rua: { terra: '#F2F3F5', agua: '#D4DAE3' },
    espaco: '#F7F7F7', terra: '#DCE0EA', agua: '#FFFFFF', destaque: '#1A27CD', destaqueOpacidade: 0.28, destaqueBorda: '#1A27CD', aro: '#7FA8FF',
    folha: '#FFFFFF', cartao: '#F2F2F5', botao: '#EBEBF0', alca: '#D1D1D6', texto: '#191C1F', texto2: '#6B6F76',
    primario: '#191C1F', primarioTexto: '#FFFFFF', circulo: 'rgba(252,252,252,0.92)', perigo: '#D42A1E', perigoTexto: '#FFFFFF',
    status: { mov: '#178F4B', parado: '#D26A06', off: '#4B5466', nosignal: '#8A909C', crit: '#D42A1E' }, grupo: '#191C1F', grupoTexto: '#FFFFFF',
  },
};

export type Modo = 'claro' | 'escuro' | 'auto';
const CHAVE_MODO = 'localle.globo.modo';
export function useTema() {
  const [modo, setModoRaw] = useState<Modo>(() => { try { const v = localStorage.getItem(CHAVE_MODO); return v === 'claro' || v === 'escuro' ? v : 'auto'; } catch { return 'auto'; } });
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [sistemaEscuro, setSistemaEscuro] = useState(!!mq?.matches);
  useEffect(() => { if (!mq) return; const f = () => setSistemaEscuro(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  const setModo = (m: Modo) => { setModoRaw(m); try { localStorage.setItem(CHAVE_MODO, m); } catch { /* sem armazenamento: vale só nesta visita */ } };
  const tema: Tema = modo === 'auto' ? (sistemaEscuro ? 'escuro' : 'claro') : modo;
  return { modo, setModo, tema };
}
