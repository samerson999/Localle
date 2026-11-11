// Gesto do ícone no hover da barra lateral (referência: ícones animados do Visor, 11/11/2026). Cada módulo faz um movimento
// que lembra o que ele é — o pneu rola, a caixa de ferramentas balança, o caminhão anda — e os demais dão um "pop".
// Os ícones são Solar prontos (icons.tsx), então o gesto é do ícone inteiro, não do traço por dentro.
// Em WAAPI e não em :hover do CSS: o gesto vai até o fim mesmo que o mouse saia no meio, sem voltar ao início de tranco.
import type { IconName } from '../components/icons';
import { reducedMotion } from './motion';

const POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const SUAVE = 'cubic-bezier(0.65, 0, 0.35, 1)';

type Gesto = { quadros: Keyframe[]; ms: number; easing?: string; origem?: string };

const pop: Gesto = { quadros: [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], ms: 380, easing: POP };
const balanca: Gesto = { quadros: [{ transform: 'rotate(0)' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(9deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(0)' }], ms: 520, easing: SUAVE, origem: '50% 90%' };
const anda: Gesto = { quadros: [{ transform: 'translateX(0)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-1px)' }, { transform: 'translateX(0)' }], ms: 450, easing: SUAVE };
const inclina: Gesto = { quadros: [{ transform: 'rotate(0)' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(0)' }], ms: 420, easing: POP, origem: '50% 100%' };
const gira: Gesto = { quadros: [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], ms: 600, easing: SUAVE };
const sobe: Gesto = { quadros: [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-3px) scale(1.08)' }, { transform: 'translateY(0) scale(1)' }], ms: 420, easing: POP };
const cresce: Gesto = { quadros: [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.7)' }, { transform: 'scaleY(1)' }], ms: 420, easing: POP, origem: '50% 100%' };

const GESTOS: Partial<Record<IconName, Gesto>> = {
  // o pino cai de cima e assenta
  monitoramento: { quadros: [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0) scaleY(0.9)' }, { transform: 'translateY(0) scaleY(1)' }], ms: 480, easing: SUAVE, origem: '50% 100%' },
  inicio: sobe,
  ranking: sobe,
  ativos: anda,
  viagens: anda,
  rota: anda,
  email: { quadros: [{ transform: 'translate(0, 0)' }, { transform: 'translate(3px, -3px)' }, { transform: 'translate(0, 0)' }], ms: 420, easing: POP },
  manutencao: balanca,
  combustivel: inclina,
  relatorios: inclina,
  documento: inclina,
  // multa: chacoalha rápido
  multas: { quadros: [{ transform: 'translateX(0)' }, { transform: 'translateX(-2px) rotate(-4deg)' }, { transform: 'translateX(2px) rotate(4deg)' }, { transform: 'translateX(-1px) rotate(-2deg)' }, { transform: 'translateX(0)' }], ms: 400, easing: 'linear' },
  // pneu rola para a frente e volta
  pneus: { quadros: [{ transform: 'translateX(0) rotate(0)' }, { transform: 'translateX(3px) rotate(180deg)' }, { transform: 'translateX(0) rotate(360deg)' }], ms: 650, easing: SUAVE },
  jornada: gira,
  historico: { ...gira, quadros: [{ transform: 'rotate(0)' }, { transform: 'rotate(-360deg)' }] },
  config: { ...gira, quadros: [{ transform: 'rotate(0)' }, { transform: 'rotate(90deg)' }], ms: 450 },
  grafico: cresce,
  tendencia: cresce,
  calendario: { quadros: [{ transform: 'perspective(40px) rotateX(0)' }, { transform: 'perspective(40px) rotateX(-25deg)' }, { transform: 'perspective(40px) rotateX(0)' }], ms: 420, easing: POP, origem: '50% 0%' },
};

const podeAnimar = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reducedMotion();

// onMouseEnter de um item do menu: anima o primeiro <svg> dele (o ícone); um gesto em andamento não recomeça.
export function animarGesto(el: HTMLElement, icon: IconName) {
  const svg = el.querySelector('svg');
  if (!svg || !podeAnimar() || svg.getAnimations().some((a) => a.id === 'gesto')) return;
  const g = GESTOS[icon] ?? pop;
  svg.style.transformOrigin = g.origem ?? '50% 50%';
  const a = svg.animate(g.quadros, { duration: g.ms, easing: g.easing ?? 'ease' });
  a.id = 'gesto';
}
