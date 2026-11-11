// Número que rola como odômetro (referência: o saldo do Visor, 11/11/2026): cada caractere numa janela própria; quando
// muda, o antigo sai para baixo e o novo cai de cima, com um leve exagero no fim e uma inclinação mínima. Só os caracteres
// que mudaram se mexem, um depois do outro da esquerda para a direita. Na primeira vez que o valor aparece, todos caem.
// As janelas são casadas pela direita, para a unidade continuar na mesma janela quando o número ganha um dígito.
import { useLayoutEffect, useRef } from 'react';
import { reducedMotion } from '../lib/motion';

const EASE_POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const PASSO = 35; // ms entre um caractere e o seguinte
const PASSO_MAX = 8; // número comprido não demora mais que isso para terminar de entrar

function Janela({ ch, ordem }: { ch: string; ordem: number }) {
  const box = useRef<HTMLSpanElement>(null);
  const face = useRef<HTMLSpanElement>(null);
  const antes = useRef<string | null>(null);
  useLayoutEffect(() => {
    const velho = antes.current;
    antes.current = ch;
    if (velho === ch || !box.current || !face.current || reducedMotion()) return;
    // duração e inclinação variam um pouco por posição: rolando todos iguais, parece um bloco só
    const duracao = 260 + ((ordem * 37) % 90);
    const giro = (((ordem * 53) % 5) - 2) * 0.6;
    const opts = { duration: duracao, delay: Math.min(ordem, PASSO_MAX) * PASSO, easing: EASE_POP };
    face.current.animate([{ transform: `translateY(-100%) rotate(${giro}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { ...opts, fill: 'backwards' });
    if (velho == null) return;
    const sai = document.createElement('span');
    sai.textContent = velho;
    sai.className = 'num-rolante-sai';
    box.current.appendChild(sai);
    sai.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(100%) rotate(${-giro}deg)`, opacity: 0 }], { ...opts, fill: 'both' }).onfinish = () => sai.remove();
  }, [ch, ordem]);
  return <span ref={box} className="num-rolante"><span ref={face} className="inline-block">{ch}</span></span>;
}

// inicio: posição do primeiro caractere na sequência, quando o número vem partido (inteiro grande + centavos menores)
export function NumeroRolante({ text, inicio = 0 }: { text: string; inicio?: number }) {
  const chars = [...text];
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="whitespace-nowrap">{chars.map((c, i) => <Janela key={chars.length - i} ch={c} ordem={inicio + i} />)}</span>
    </>
  );
}
