import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import IconVelocidade from '~icons/solar/speedometer-middle-bold-duotone';
import IconCerca from '~icons/solar/map-point-remove-bold-duotone';
import IconParada from '~icons/solar/stop-circle-bold-duotone';
import iluTelemetria from '../images/ilustracoes/web/ilu-telemetria-page.webp';
import iluErro from '../images/ilustracoes/web/ilu-erro-page.webp';
import iluTudoEmDia from '../images/ilustracoes/web/ilu-tudo-em-dia-page.webp';
import caminhao from '../images/png-tight/11-truck-6x2.png';
import iluCombustivel from '../images/ilustracoes/web/ilu-combustivel-page.webp';
import iluManutencao from '../images/ilustracoes/web/ilu-manutencao-page.webp';
import IconPosto from '~icons/solar/gas-station-bold-duotone';
import IconOficina from '~icons/solar/toolbox-bold-duotone';
import IconMulta from '~icons/solar/ticket-bold-duotone';
import IconPneu from '~icons/solar/wheel-bold-duotone';

// Painel ao lado do login (pages/Login.tsx): carrossel de destaques no molde do login do Visor
// (dashboard.visorfinance.app/login, 04/11/2026) — cada slide é o produto em miniatura, montado com as peças da
// própria interface (marcador do mapa, card do "Precisa de você"), e as partes entram em sequência quando o slide
// fica ativo. Sem dado fictício: nada de placa nem número, só a forma. Animação toda em CSS (base.css › tela de
// login); o slide ativo recebe data-run e o anterior guarda o atributo até terminar de sumir, para não "pular".
// A barra de progresso dita o tempo: quando ela termina (animationend), passa para o próximo; pausa com o mouse
// em cima ou com foco no painel; com movimento reduzido ela não anda e a troca é só pelo clique.

type Slide = { titulo: ReactNode; apoio: string; arte: ReactNode };

export default function LoginShowcase({ tagline }: { tagline?: string }) {
  const slides: Slide[] = [
    { titulo: tagline || <>Toda a frota no mapa, <Rota>em tempo real</Rota></>, apoio: 'Posição, velocidade e ignição de cada veículo, a cada sinal do rastreador.', arte: <ArteMapa /> },
    { titulo: <>O alerta chega <Rota>antes do problema</Rota></>, apoio: 'Velocidade, cerca e parada viram aviso na hora, com o caminho direto para tratar.', arte: <ArteAlertas /> },
    { titulo: <>Custo por veículo, <Rota>sem planilha</Rota></>, apoio: 'Combustível, manutenção, multas e pneus somados no mesmo lugar.', arte: <ArteCustos /> },
  ];
  const [cur, setCur] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const ir = (i: number) => {
    if (i === cur) return;
    setPrev(cur); setCur(i);
    window.setTimeout(() => setPrev((p) => (p === cur ? null : p)), 450);
  };
  return (
    <div className="login-show relative w-full flex flex-col items-center">
      <div className="login-stage relative shrink-0" aria-hidden="true">
        {slides.map((s, i) => <div key={i} className="login-slide" data-on={i === cur || undefined} data-run={i === cur || i === prev || undefined}>{s.arte}</div>)}
      </div>
      <div className="relative w-full max-w-[460px] h-[132px] mt-8">
        {slides.map((s, i) => (
          <div key={i} className="login-slide login-copy text-center" data-on={i === cur || undefined} data-run={i === cur || i === prev || undefined} aria-hidden={i !== cur}>
            <h2 className="text-[clamp(24px,2.3vw,32px)] leading-[1.2] tracking-[var(--ls-title)] font-semibold text-ink">{s.titulo}</h2>
            <p className="mt-3 text-body text-ink-2">{s.apoio}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-6">
        {slides.map((_, i) => (
          <button key={i} type="button" onClick={() => ir(i)} aria-label={`Mostrar destaque ${i + 1} de ${slides.length}`} aria-current={i === cur || undefined} className="login-seg group grid place-items-center h-6 px-0.5">
            <span className="block w-8 h-1 rounded-pill bg-line-strong overflow-hidden">
              {i === cur && <span key={cur} className="login-seg-fill block h-full w-full rounded-pill bg-brand" onAnimationEnd={() => ir((cur + 1) % slides.length)} />}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// expressão do título sublinhada por uma rota tracejada que se desenha e termina num ponto, como um pino
function Rota({ children }: { children: ReactNode }) {
  const id = useId();
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg className="login-rota absolute left-0 w-full -bottom-[0.3em] h-[0.4em] overflow-visible" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
        <mask id={id} maskUnits="userSpaceOnUse" x="-4" y="-8" width="208" height="28"><path className="login-rota-mask" d="M2 7 C 44 2, 86 11, 128 6 S 182 3, 198 6" pathLength={1} fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" /></mask>
        <path d="M2 7 C 44 2, 86 11, 128 6 S 182 3, 198 6" mask={`url(#${id})`} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 6" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="login-rota-pino absolute -right-[0.22em] -bottom-[0.34em] size-[0.28em] rounded-full bg-brand ring-[0.08em] ring-card" />
    </span>
  );
}

// peça da biblioteca 3D (images/ilustracoes, png-tight): entra com um leve quique e depois flutua devagar
function Peca3d({ src, style, className = '' }: { src: string; style: CSSProperties; className?: string }) {
  return <div className={`login-3d login-pop ${className}`} style={style}><span className="login-flutua block"><img src={src} alt="" className="block w-full h-auto" draggable={false} /></span></div>;
}

// trajeto do veículo pelas ruas do mapa (viewBox 400×300); o mesmo d vira o offset-path do marcador em base.css
const TRAJETO = 'M60 240 H146 Q160 240 160 226 V144 Q160 130 174 130 H276 Q290 130 290 116 V90';

function ArteMapa() {
  return <>
    <div className="login-mapa">
      <svg viewBox="0 0 400 300" className="block w-full h-full">
        <rect width="400" height="300" fill="var(--map-bg)" />
        <rect className="login-parque" x="186" y="156" width="88" height="64" rx="10" />
        <g className="login-ruas" fill="none" strokeLinecap="round">
          <path d="M-10 60 H410 M-10 130 H410 M-10 240 H410 M60 -10 V310 M160 -10 V310 M290 -10 V310 M360 -10 V310" strokeWidth="14" />
          <path d="M-10 186 H130 M220 -10 V100 M330 186 H410 M100 130 V240" strokeWidth="8" />
          <path d="M-20 300 L250 -20" strokeWidth="18" />
        </g>
        <path className="login-previsto" d={TRAJETO} fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.5 9" />
        <path className="login-rastro" d={TRAJETO} pathLength={1} fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <g className="login-origem"><circle cx="60" cy="240" r="7" /><circle cx="60" cy="240" r="3" className="login-origem-miolo" /></g>
        <g className="login-destino" transform="translate(290 64)">
          <circle className="login-onda" r="10" /><circle className="login-onda dois" r="10" />
          <g className="login-pino"><path d="M0 0 C -2 -6, -11 -10, -11 -19 a11 11 0 0 1 22 0 C 11 -10, 2 -6, 0 0 Z" /><circle cy="-19" r="4.2" className="login-pino-miolo" /></g>
        </g>
        <g className="login-veiculo">
          <circle r="22" className="login-veiculo-halo" />
          <circle r="13" className="login-veiculo-disco" />
          <path d="M12 2.5 19 21l-7-4.5L5 21z" transform="rotate(90) translate(-7.5 -8) scale(0.62)" className="login-veiculo-seta" />
        </g>
      </svg>
    </div>
    <div className="login-chip login-pop" style={{ right: '6%', bottom: '16%', ['--d' as string]: '900ms' }}>
      <span className="login-chip-troca">
        <span className="login-chip-a"><i className="bg-mov" />Em movimento</span>
        <span className="login-chip-b"><i className="bg-warn" />Parado no destino</span>
      </span>
    </div>
    <Peca3d src={caminhao} style={{ left: '-3%', bottom: '10%', width: '28%', ['--r' as string]: '-6deg', ['--d' as string]: '650ms' }} />
    <Peca3d src={iluTelemetria} style={{ right: '-4%', top: '-2%', width: '30%', ['--r' as string]: '8deg', ['--d' as string]: '400ms', ['--f' as string]: '-3s' }} />
  </>;
}

function ArteAlertas() {
  const cards = [
    { cls: 'a', Icone: IconParada, titulo: 'Parada fora da rota' },
    { cls: 'b', Icone: IconCerca, titulo: 'Saída de cerca' },
    { cls: 'c', Icone: IconVelocidade, titulo: 'Excesso de velocidade' },
  ];
  return <>
    <div className="login-painel">
      <div className="login-painel-topo">
        <span>Precisa de você</span>
        <span className="login-contador"><span className="login-contador-fita"><b>1</b><b>2</b><b>3</b></span></span>
      </div>
      <div className="login-lista">
        {cards.map(({ cls, Icone, titulo }) => (
          <div key={cls} className={`login-alerta ${cls}`}>
            <span className="login-alerta-icone"><Icone /></span>
            <span className="login-alerta-texto"><b>{titulo}</b><span>Veículo da frota · agora</span></span>
            <span className="login-alerta-acao">Tratar</span>
          </div>
        ))}
      </div>
    </div>
    <Peca3d src={iluErro} className="login-cone" style={{ right: '-11%', top: '-13%', width: '30%', ['--r' as string]: '6deg', ['--d' as string]: '350ms' }} />
    <Peca3d src={iluTudoEmDia} style={{ left: '-5%', bottom: '2%', width: '28%', ['--r' as string]: '-8deg', ['--d' as string]: '3000ms', ['--f' as string]: '-2s' }} />
  </>;
}

// geometria do slide 3 em cqw (base.css › slide 3): cada barra de categoria voa da sua linha para o seu trecho na barra
// empilhada do total. A barra do total tem a largura da trilha (W), então cada trecho é a barra encolhida por 1/S.
// Os comprimentos são só forma (sem valor): proporções fixas, na ordem da escala categórica.
const CUSTO = { W: 36, linha: 9.5, barraTopo: 1.7, totalTopo: 41.5, voo: 1900, passo: 120, duracaoVoo: 700 };
const CATEGORIAS = [
  { Icone: IconPosto, nome: 'Combustível', p: 0.86, fill: 'fill-cat-1' },
  { Icone: IconOficina, nome: 'Manutenção', p: 0.58, fill: 'fill-cat-2' },
  { Icone: IconMulta, nome: 'Multas', p: 0.34, fill: 'fill-cat-3' },
  { Icone: IconPneu, nome: 'Pneus', p: 0.44, fill: 'fill-cat-4' },
];

function ArteCustos() {
  const S = CATEGORIAS.reduce((t, c) => t + c.p, 0);
  let acum = 0;
  const linhas = CATEGORIAS.map((c, k) => {
    const dx = (CUSTO.W * acum) / S; acum += c.p;
    const topo = k * CUSTO.linha + CUSTO.barraTopo;
    const voo = CUSTO.voo + k * CUSTO.passo;
    return { ...c, k, dx, dy: CUSTO.totalTopo - topo, voo, pousa: voo + CUSTO.duracaoVoo };
  });
  const v = (o: Record<string, string>) => o as CSSProperties;
  return <>
    <div className="login-custos" style={v({ '--W': CUSTO.W + 'cqw', '--s': String(1 / S) })}>
      <div className="login-painel-topo"><span>Custo do mês</span></div>
      <div className="login-custos-linhas">
        {linhas.map(({ Icone, nome, p, fill, k, dx, dy, voo }) => (
          <div key={nome} className="login-custo" style={v({ top: k * CUSTO.linha + 'cqw', '--k': String(k), '--p': String(p), '--dx': dx + 'cqw', '--dy': dy + 'cqw', '--voo': voo + 'ms' })}>
            <span className="login-custo-icone"><Icone /></span>
            <span className="login-custo-nome">{nome}</span>
            <span className={`login-custo-barra ${fill}`} />
            <span className={`login-custo-voo ${fill}`} />
          </div>
        ))}
        <div className="login-custo-total">
          <span className="login-custo-total-nome">Total por veículo</span>
          <span className="login-custo-trilha">
            {linhas.map(({ nome, p, fill, pousa }) => <span key={nome} className={`login-custo-trecho ${fill}`} style={v({ '--p': String(p), '--pousa': pousa + 'ms' })} />)}
          </span>
          <span className="login-custo-ok" />
        </div>
      </div>
    </div>
    <Peca3d src={iluCombustivel} style={{ right: '-6%', top: '-3%', width: '28%', ['--r' as string]: '7deg', ['--d' as string]: '400ms', ['--f' as string]: '-3s' }} />
    <Peca3d src={iluManutencao} style={{ left: '-6%', bottom: '0%', width: '28%', ['--r' as string]: '-7deg', ['--d' as string]: '700ms', ['--f' as string]: '-1.5s' }} />
  </>;
}
