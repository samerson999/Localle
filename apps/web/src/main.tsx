import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App';
import { toast } from './components/ui';
import { mensagemDeErro } from './lib/apiErro';
import { iniciarRenovacaoSessao } from './lib/localleApi';

// Última linha de defesa: promessa rejeitada sem `catch` (salvar sem tratamento, etc.) vira aviso na tela
// em vez de sumir no console. Cada chamada deveria tratar o próprio erro; isto cobre o que escapou.
window.addEventListener('unhandledrejection', (ev) => {
  if ((ev.reason as Error)?.name === 'AbortError') return;
  console.error('Promessa rejeitada sem tratamento', ev.reason);
  toast('Não foi possível concluir a ação', { tone: 'crit', detail: mensagemDeErro(ev.reason) });
});

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

iniciarRenovacaoSessao();

// PWA: o service worker (public/sw.js) só no build de produção — no `pnpm dev` ele guardaria o shell e atrapalharia o
// recarregamento do Vite. Falha no registro não impede o app de funcionar, só a instalação.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker não registrado', err));
  });
}
