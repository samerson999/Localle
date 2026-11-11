// Início do gestor (pedido do usuário em 11/11/2026): o estado geral da frota numa tela.
//
// Conteúdo (definido pelo usuário): 1) panorama da frota, o destaque; 2) atividade do dia; 3) utilização da frota em 8 dias, um
// gráfico só, amplo; 4) conectividade dos rastreadores, separando "sem comunicação" de "parado"; 5) distribuição por grupo.
//
// Composição inspirada no painel enviado pelo usuário em 11/11 (não literal): resumo da frota grande à esquerda, atividade e
// conectividade empilhadas à direita; utilização em largura total; grupos ao lado de um cartão com a leitura da semana. Sem
// imagens: gráfico e anel em SVG. É um espelho do sistema agora (sem escolher outro dia) e, no desktop, cabe inteiro na
// altura da tela (três faixas que dividem a altura livre, sem rolagem) quando o conteúdo cabe nela; senão — zoom do
// navegador alto, janela baixa, tela estreita — as faixas voltam à altura natural e a página rola (useEncaixe).
//
// Componentes do ui.tsx (pele do HeroUI v3, adotada em 11/11): Card, Select, Table com ordenação, Progress, Skeleton, Tooltip;
// cores pelos tokens (texto, linhas, --real para dados) e status pelos glifos do sistema (StatusGlyph).
//
// Fontes: estado ao vivo do store (posição, ignição, comunicação — o mesmo do Monitoramento) e o resumo de uso da API
// (GET /monitoring/resumo-uso: km e minutos em movimento por veículo e por dia, do agregado uso_5min). "Usado" num dia =
// rodou pelo menos 1 km. Viagens vêm do módulo Viagens, quando contratado. O filtro de grupo vale para a tela inteira.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore, vehicleStatus } from '../lib/store';
import { useResumoUso } from '../lib/localleApi';
import { Icon, type IconName } from '../components/icons';
import { StatusGlyph, type StatusKind } from '../components/story';
import { Button, Card, CardHeader, EmptyState, PageHeader, Progress, Select, Skeleton, Table, Tooltip, cx } from '../components/ui';
import { fmtT, num } from '@localle/shared/utils';
import { paraUi, rectUi, viewportUi } from '../lib/uiZoom';
import { useCountUp } from '../lib/motion';

const KM_USADO = 1; // rodou pelo menos isso no dia = veículo usado
const RECENTE_MS = 30 * 60_000; // "dados recentes": posição dos últimos 30 minutos

const ESTADOS: { k: 'mov' | 'par' | 'des' | 'sem'; label: string; kind: StatusKind; cor: string }[] = [
  { k: 'mov', label: 'Em movimento', kind: 'mov', cor: 'var(--status-mov)' },
  { k: 'par', label: 'Parado ligado', kind: 'parado', cor: 'var(--status-parado)' },
  { k: 'des', label: 'Desligado', kind: 'off', cor: 'var(--status-off)' },
  { k: 'sem', label: 'Sem sinal', kind: 'nosignal', cor: 'var(--ink-3)' },
];

type ItemFrota = { a: any; v: any; k: 'mov' | 'par' | 'des' | 'sem' };
type UsoDia = Map<string, { km: number; min: number }>;

const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);
const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');
const dataUtc = (dia: string) => new Date(`${dia}T12:00:00Z`);
const diaCurto = (dia: string) => dataUtc(dia).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
const diaMes = (dia: string) => dataUtc(dia).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const diaLongo = (dia: string) => dataUtc(dia).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const horas = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`);
const haQuanto = (t: number) => { const m = Math.round((Date.now() - t) / 60_000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${horas(m)}`; };

export default function Inicio() {
  const todos = useStore(useShallow((s) => s.assets.filter((a: any) => a.tracker)));
  const vehicles = useStore((s) => s.vehicles);
  const groups = useStore((s) => s.groups);
  const trips = useStore((s) => s.trips);
  const viagensOn = useStore((s) => !!s.revenda.modules.viagens);
  const { dados, carregando: buscando, erro } = useResumoUso();
  const carregando = buscando && !dados;
  const [grupo, setGrupo] = useState('');

  const assets = useMemo(() => (grupo ? todos.filter((a: any) => a.groupIds?.includes(grupo)) : todos), [todos, grupo]);
  const frota: ItemFrota[] = useMemo(() => assets.map((a: any) => ({ a, v: vehicles[a.id], k: vehicleStatus(vehicles[a.id]).key as ItemFrota['k'] })), [assets, vehicles]);
  const total = frota.length;

  const uso = useMemo(() => {
    const m = new Map<string, UsoDia>();
    if (!dados) return m;
    const ids = new Set(assets.map((a: any) => a.id));
    for (const u of dados.uso) {
      if (!ids.has(u.assetId)) continue;
      if (!m.has(u.dia)) m.set(u.dia, new Map());
      m.get(u.dia)!.set(u.assetId, { km: u.km, min: u.minutosMovimento });
    }
    return m;
  }, [dados, assets]);
  const dias = dados?.dias ?? [];
  const hoje = dias[dias.length - 1];
  const usadosNo = (d: string, ids?: Set<string>) => [...(uso.get(d)?.entries() ?? [])].filter(([id, x]) => x.km >= KM_USADO && (!ids || ids.has(id))).length;
  const util = dias.map((d) => pct(usadosNo(d), total));
  const ultima = Math.max(0, ...frota.filter((x) => x.v).map((x) => x.v.lastUpdate));
  // hoje × média dos 7 dias anteriores (o gráfico e o cartão de leitura usam a mesma conta)
  const anteriores = util.slice(0, -1);
  const media = anteriores.length ? anteriores.reduce((s, x) => s + x, 0) / anteriores.length : 0;
  const delta = (util[util.length - 1] ?? 0) - media;
  // o conteúdo muda de altura ao carregar o resumo e ao trocar de grupo (a faixa de grupos some): tenta encaixar de novo
  const { ref: tela, encaixe } = useEncaixe(`${carregando}|${grupo}|${groups.length}|${erro ? 1 : 0}`);

  if (!todos.length) return (
    <div>
      <PageHeader title="Início" />
      <Card><EmptyState size="page" illustration="ilu-busca-veiculo" title="Nenhum veículo rastreado ainda" detail="Vincule um rastreador ao veículo em Ativos para acompanhar a frota aqui." action={<Link to="/ativos"><Button>Abrir ativos</Button></Link>} /></Card>
    </div>
  );

  const gruposComFrota = groups.filter((g: any) => todos.some((a: any) => a.groupIds?.includes(g.id)));
  const mostraGrupos = gruposComFrota.length > 0 && !grupo;

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <PageHeader title="Início">
        {gruposComFrota.length > 0 && <Select aria-label="Grupo" className="w-[220px] max-md:w-full" value={grupo} onChange={(e) => setGrupo(e.target.value)}
          options={[{ value: '', label: 'Toda a frota' }, ...gruposComFrota.map((g: any) => ({ value: g.id, label: g.name }))]} />}
      </PageHeader>
      {erro && <p role="status" className="mb-grid text-small text-ink-2">Não foi possível carregar a atividade e a utilização ({erro}). O estado da frota continua ao vivo.</p>}

      {/* encaixado: altura = o que sobra da janela, e as três faixas (resumo, utilização, grupos) dividem essa altura; --fit
          reduz os números grandes em janela mais baixa. Sem encaixe: faixas na altura natural, a página rola. */}
      <div ref={tela} style={encaixe ? { height: encaixe.altura, marginBottom: 'calc(var(--sp-6) - var(--page-end))', ['--fit' as any]: encaixe.fit } : undefined}
        className={cx('grid grid-cols-1 lg:grid-cols-12 gap-grid', encaixe && 'grid-rows-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.9fr)] [&>*]:min-h-0')}>
        <Resumo className="lg:col-span-7" frota={frota} total={total} />
        <div className="lg:col-span-5 grid gap-grid lg:grid-rows-[auto_minmax(0,1fr)] min-h-0">
          <Atividade carregando={carregando} uso={hoje ? uso.get(hoje) : undefined} total={total} viagens={viagensOn ? viagensDoDia(trips, hoje, assets) : null} />
          <Conectividade frota={frota} total={total} ultima={ultima} />
        </div>
        <Utilizacao className="lg:col-span-12" carregando={carregando} dias={dias} util={util} usados={dias.map((d) => usadosNo(d))}
          km={dias.map((d) => soma(uso.get(d), 'km'))} total={total} media={media} delta={delta} />
        {mostraGrupos && <Grupos className="lg:col-span-8" frota={frota} groups={gruposComFrota} dias={dias.slice(0, -1)} usadosNo={usadosNo} carregando={carregando} />}
        <Leitura className={mostraGrupos ? 'lg:col-span-4' : 'lg:col-span-12'} carregando={carregando} delta={delta} media={media} hoje={util[util.length - 1] ?? 0} />
      </div>
    </div>
  );
}

// Encaixe na tela (lg+): o painel ocupa a altura livre da janela abaixo do seu topo, sem rolagem — mas só se o conteúdo
// couber nela. Antes a altura tinha piso fixo (620 px) e, com o zoom do navegador alto, as faixas ficavam menores que o
// conteúdo e tudo se sobrepunha. Agora: aplica a altura, confere se algum cartão transbordou e, se sim, desiste do encaixe
// (altura natural, a página rola) até a janela mudar de tamanho ou o conteúdo mudar (`chave`). Abaixo de lg: altura natural.
// Medida em coordenadas da interface (o <html> tem zoom, lib/uiZoom).
const ALTURA_CHEIA = 900; // a partir desta altura livre os números ficam no tamanho cheio; abaixo, encolhem até FIT_MIN
const FIT_MIN = 0.8;
function useEncaixe(chave: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [encaixe, setEncaixe] = useState<{ altura: number; fit: number } | null>(null);
  const medir = useCallback(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(min-width: 1024px)').matches) { setEncaixe(null); return; }
    const altura = Math.floor(viewportUi().h - (rectUi(el).top + paraUi(window.scrollY)) - 24);
    setEncaixe({ altura, fit: Math.min(1, Math.max(FIT_MIN, altura / ALTURA_CHEIA)) });
  }, []);
  useLayoutEffect(() => {
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [medir]);
  useLayoutEffect(medir, [medir, chave]);
  // com a altura aplicada (antes da pintura): algum cartão ficou menor que o conteúdo? Rolagem própria (tabela de grupos)
  // não conta — ela existe para isso.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!encaixe || !el) return;
    const transborda = (n: Element, nivel: number): boolean => [...n.children].some((c) => {
      if (!(c instanceof HTMLElement)) return false;
      const oy = getComputedStyle(c).overflowY;
      if (oy !== 'auto' && oy !== 'scroll' && c.scrollHeight > c.clientHeight + 1) return true;
      return nivel < 3 && transborda(c, nivel + 1);
    });
    if (transborda(el, 1)) setEncaixe(null);
  }, [encaixe]);
  return { ref, encaixe };
}

function soma(m: UsoDia | undefined, k: 'km' | 'min') {
  let t = 0; for (const x of m?.values() ?? []) t += x[k]; return t;
}

// viagens do dia (data local do navegador, que para a operação é a mesma do fuso do resumo)
function viagensDoDia(trips: any[], dia: string | undefined, assets: any[]) {
  if (!dia) return { iniciadas: 0, concluidas: 0 };
  const ids = new Set(assets.map((a: any) => a.id));
  const t0 = new Date(`${dia}T00:00:00`).getTime(), t1 = t0 + 86_400_000;
  const no = (t?: number) => !!t && t >= t0 && t < t1;
  const daFrota = trips.filter((t) => !t.assetId || ids.has(t.assetId));
  return { iniciadas: daFrota.filter((t) => no(t.startedAt)).length, concluidas: daFrota.filter((t) => t.status === 'concluida' && no(t.endedAt)).length };
}

// ---------- peças ----------
// Conta até o valor na primeira carga (useCountUp, o mesmo motion dos KPIs da Manutenção), no formato pedido.
function Conta({ v, f = (n) => num(Math.round(n)) }: { v: number; f?: (n: number) => string }) {
  return <>{f(useCountUp(v) ?? 0)}</>;
}
// Número grande: dois degraus de tamanho na tela (rótulo pequeno e número), sempre com .num.
function Numero({ children, tamanho = 'md', className = '' }: { children: React.ReactNode; tamanho?: 'xl' | 'lg' | 'md'; className?: string }) {
  return <span className={cx('num font-semibold text-ink tracking-[-0.02em] leading-none', { xl: 'text-[56px] sm:text-[length:calc(72px*var(--fit,1))] tracking-[-0.04em]', lg: 'text-[44px] sm:text-[length:calc(52px*var(--fit,1))] tracking-[-0.03em]', md: 'text-[22px] sm:text-[24px]' }[tamanho], className)}>{children}</span>;
}

function Variacao({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.05) return <span className="inline-flex items-center h-7 px-2.5 rounded-pill bg-card-2 text-small text-ink-2">estável</span>;
  return <span className={cx('num inline-flex items-center h-7 px-2.5 rounded-pill text-small font-semibold', delta > 0 ? 'bg-pos-soft text-mov' : 'bg-card-2 text-ink-2')}>{delta > 0 ? '↑' : '↓'} {fmt1(Math.abs(delta))} p.p.</span>;
}

// 1) Resumo da frota: total grande, barra por estado (vão de 2 px entre trechos) e cada estado com número e %.
function Resumo({ className, frota, total }: { className: string; frota: ItemFrota[]; total: number }) {
  const conta = (k: string) => frota.filter((x) => x.k === k).length;
  const recentes = frota.filter((x) => x.v && Date.now() - x.v.lastUpdate < RECENTE_MS).length;
  return (
    <Card className={className} title="Resumo da frota" icon="tendencia" to="/monitoramento">
      <div className="flex flex-col justify-between gap-6 h-full">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <Numero tamanho="xl"><Conta v={total} /></Numero>
            <span className="text-h2 text-ink-2 pb-1">{total === 1 ? 'veículo' : 'veículos'} rastreados</span>
          </div>
          <span className="self-start inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-card-2 text-small text-ink-2">
            <span className="num font-semibold text-ink"><Conta v={pct(recentes, total)} f={fmt1} />%</span> com posição nos últimos 30 min
          </span>
        </div>
        <div className="flex flex-col gap-5">
          <div role="img" aria-label={ESTADOS.map((e) => `${e.label}: ${conta(e.k)}`).join(', ')} className="flex h-2.5 gap-[2px] rounded-pill overflow-hidden bg-track">
            {ESTADOS.map((e, i) => conta(e.k) > 0 && <span key={e.k} className="grow-x" style={{ flexGrow: conta(e.k), background: e.cor, ['--i' as any]: i * 2 }} />)}
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
            {ESTADOS.map((e) => (
              <li key={e.k} className="flex flex-col gap-1.5 min-w-0">
                <span className="flex items-center gap-tight text-small text-ink-2 truncate"><StatusGlyph kind={e.kind} />{e.label}</span>
                <span className="flex items-baseline gap-1.5"><Numero><Conta v={conta(e.k)} /></Numero><span className="num text-small text-ink-2">({fmt1(pct(conta(e.k), total))}%)</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

// 2) Atividade de hoje: km, tempo em movimento, viagens (ou quantos rodaram, sem o módulo Viagens).
function Atividade({ carregando, uso, total, viagens }: { carregando: boolean; uso: UsoDia | undefined; total: number; viagens: { iniciadas: number; concluidas: number } | null }) {
  const km = soma(uso, 'km'), min = soma(uso, 'min');
  const rodaram = [...(uso?.values() ?? [])].filter((x) => x.km >= KM_USADO).length;
  const itens: { icone: IconName; valor: React.ReactNode; rot: string; espera: boolean }[] = [
    { icone: 'rota', valor: <><Conta v={km} /> km</>, rot: 'percorridos', espera: carregando },
    { icone: 'relogio', valor: <Conta v={min} f={(m) => horas(Math.round(m))} />, rot: 'em movimento', espera: carregando },
    viagens ? { icone: 'bandeira', valor: <Conta v={viagens.iniciadas} />, rot: `${viagens.iniciadas === 1 ? 'viagem' : 'viagens'} · ${viagens.concluidas} concl.`, espera: false }
      : { icone: 'ativos', valor: <Conta v={rodaram} />, rot: `de ${total} rodaram`, espera: carregando },
  ];
  return (
    <Card dense title="Atividade de hoje" icon="viagens" to="/relatorios/uso">
      <div className="grid grid-cols-3 sm:divide-x divide-line">
        {itens.map((x) => (
          <div key={x.icone} className="flex items-start gap-tight min-w-0 sm:px-4 sm:first:pl-0 sm:last:pr-0">
            <Icon name={x.icone} size={22} className="mt-0.5 shrink-0 text-ink-2 max-sm:hidden" />
            <div className="min-w-0 flex flex-col gap-1">
              {x.espera ? <Skeleton className="h-6 w-20" /> : <Numero className="truncate">{x.valor}</Numero>}
              <span className="text-small text-ink-2 truncate">{x.rot}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// 4) Conectividade: % transmitindo, anel e a separação entre "sem comunicação" (rastreador calado além do limite do cliente)
// e os demais casos — diferente de veículo parado, que segue mandando posição.
function Conectividade({ frota, total, ultima }: { frota: ItemFrota[]; total: number; ultima: number }) {
  const transmitindo = frota.filter((x) => x.v && !x.v.noSignal).length;
  const linhas: { label: string; n: number; kind: StatusKind; dica?: string }[] = [
    { label: 'Transmitindo', n: transmitindo, kind: 'mov' },
    { label: 'Sem comunicação', n: frota.filter((x) => x.v?.noSignal && x.v?.comunicacao !== 'sem_gps').length, kind: 'nosignal', dica: 'O rastreador parou de enviar dados — não é o mesmo que veículo parado.' },
    { label: 'Sem GPS', n: frota.filter((x) => x.v?.comunicacao === 'sem_gps').length, kind: 'parado', dica: 'Envia dados, mas sem posição válida.' },
    { label: 'Aguardando 1ª posição', n: frota.filter((x) => !x.v).length, kind: 'off', dica: 'Rastreador instalado que ainda não mandou posição.' },
  ];
  const visiveis = linhas.filter((l) => l.n > 0 || l.label === 'Transmitindo' || l.label === 'Sem comunicação');
  const p = pct(transmitindo, total);
  const pAnim = useCountUp(p) ?? 0; // o anel enche junto com o número
  const R = 34, C = 2 * Math.PI * R;
  return (
    <Card dense title="Conectividade dos rastreadores" icon="sinal" to="/monitoramento"
      subtitle={ultima ? `Última posição às ${fmtT(ultima)} (${haQuanto(ultima)})` : 'Nenhuma posição recebida ainda'}>
      <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)] items-center gap-x-6 gap-y-4">
        <div className="max-sm:col-span-2 flex flex-col gap-1.5">
          <Numero tamanho="lg"><Conta v={p} f={fmt1} />%</Numero>
          <span className="text-small text-ink-2">{transmitindo} de {total} transmitindo</span>
        </div>
        <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${fmt1(p)}% transmitindo`}>
          <circle cx="42" cy="42" r={R} fill="none" stroke="var(--track)" strokeWidth="10" />
          <circle cx="42" cy="42" r={R} fill="none" stroke="var(--real)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pAnim / 100) * C} ${C}`} transform="rotate(-90 42 42)" />
        </svg>
        <ul className="flex flex-col gap-2.5 min-w-0">
          {visiveis.map((l) => {
            const linha = <li key={l.label} className="flex items-center gap-2.5 text-body"><StatusGlyph kind={l.kind} /><span className="flex-1 min-w-0 truncate">{l.label}</span><span className="num font-semibold">{l.n}</span></li>;
            return l.dica ? <Tooltip key={l.label} content={l.dica}>{linha}</Tooltip> : linha;
          })}
        </ul>
      </div>
    </Card>
  );
}

// 3) Utilização: % da frota que rodou por dia, 7 dias anteriores + hoje. Uma série só (sem legenda), área com linha de 2 px.
// O eixo começa 10 p.p. abaixo do menor valor (múltiplo de 10) e vai a 100%. Hoje fica marcado com o valor; os outros dias
// mostram a dica ao passar o cursor/focar. O gráfico ocupa a altura do cartão. Tabela equivalente para leitor de tela.
function Utilizacao({ className, carregando, dias, util, usados, km, total, media, delta }: {
  className: string; carregando: boolean; dias: string[]; util: number[]; usados: number[]; km: number[]; total: number; media: number; delta: number;
}) {
  const n = dias.length;
  const marcado = n - 1; // hoje
  const piso = n ? Math.max(0, Math.floor((Math.min(...util) - 10) / 10) * 10) : 0;
  const marcas = Array.from({ length: (100 - piso) / 10 + 1 }, (_, i) => 100 - i * 10).filter((m, i, l) => l.length <= 6 || i % 2 === 0 || m === piso);
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const y = (v: number) => ((100 - v) / (100 - piso)) * 100;
  const pts = util.map((v, i) => [x(i), y(v)] as const);
  // curva suave (Catmull-Rom → Bézier) passando pelos valores reais
  const linha = pts.map(([px, py], i) => {
    if (!i) return `M${px},${py}`;
    const [x0, y0] = pts[Math.max(0, i - 2)], [x1, y1] = pts[i - 1], [x3, y3] = pts[Math.min(n - 1, i + 1)];
    return `C${x1 + (px - x0) / 6},${y1 + (py - y0) / 6} ${px - (x3 - x1) / 6},${py - (y3 - y1) / 6} ${px},${py}`;
  }).join(' ');
  const detalhe = (i: number) => `${fmt1(util[i])}% · ${usados[i]} de ${total} veículos · ${num(Math.round(km[i]))} km`;
  return (
    <Card dense className={className}>
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-0 h-full">
        <div className="lg:w-[300px] shrink-0 flex flex-col gap-5 lg:pr-8 lg:border-r border-line">
          <CardHeader title="Utilização da frota" icon="grafico" subtitle={`Veículos que rodaram ${KM_USADO} km ou mais no dia`} />
          <div className="flex flex-col gap-3">
            {carregando ? <Skeleton className="h-12 w-40" /> : <Numero tamanho="lg"><Conta v={util[n - 1] ?? 0} f={fmt1} />%</Numero>}
            {!carregando && n > 1 && <span className="flex flex-wrap items-center gap-2 text-small text-ink-2"><Variacao delta={delta} /> hoje vs. média dos 7 dias ({fmt1(media)}%)</span>}
          </div>
        </div>
        <div className="flex-1 min-w-0 lg:pl-8 flex flex-col min-h-[220px] lg:min-h-0">
          {carregando ? <Skeleton className="flex-1 w-full" /> : (
            <>
              <div className="relative flex-1 min-h-[110px] ml-11 mr-3 mt-8">
                {marcas.map((g) => (
                  <span key={g} aria-hidden="true" className="absolute inset-x-0 border-t border-line" style={{ top: `${y(g)}%` }}>
                    <span className="absolute -left-11 -translate-y-1/2 w-9 text-right text-caption text-ink-2 num">{g}%</span>
                  </span>
                ))}
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="reveal-x absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
                  <defs><linearGradient id="util-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--real)" stopOpacity="0.20" /><stop offset="100%" stopColor="var(--real)" stopOpacity="0" /></linearGradient></defs>
                  {n > 1 && <path d={`${linha} L${x(n - 1)},100 L0,100 Z`} fill="url(#util-area)" />}
                  {n > 1 && <path d={linha} fill="none" stroke="var(--real)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
                </svg>
                {/* etiqueta do dia escolhido */}
                {marcado >= 0 && (
                  <span className="fade-after absolute px-2.5 h-7 flex items-center rounded-btn text-small font-semibold num whitespace-nowrap pointer-events-none text-white bg-real"
                    style={{ left: `${x(marcado)}%`, top: `${y(util[marcado] ?? 0)}%`, transform: `translate(${marcado === 0 ? '-12px' : marcado === n - 1 ? 'calc(-100% + 12px)' : '-50%'}, calc(-100% - 14px))` }}>
                    {fmt1(util[marcado] ?? 0)}%
                  </span>
                )}
                {/* pontos: cada um é o alvo do dia (dica com os números; tocar escolhe o dia) */}
                {util.map((v, i) => (
                  <Tooltip key={dias[i]} content={<><span className="capitalize">{diaLongo(dias[i])}</span>: {detalhe(i)}</>}>
                    <span tabIndex={0} role="img" aria-label={`${diaLongo(dias[i])}: ${detalhe(i)}`}
                      className="fade-after absolute w-9 h-9 -ml-[18px] -mt-[18px] rounded-full flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-real"
                      style={{ left: `${x(i)}%`, top: `${y(v)}%`, ['--i' as any]: i }}>
                      <span aria-hidden="true" className={cx('rounded-full bg-card transition-transform', i === marcado ? 'w-4 h-4 border-[3px] shadow-[0_0_0_5px_var(--real-soft)]' : 'w-2.5 h-2.5 border-2')} style={{ borderColor: 'var(--real)' }} />
                    </span>
                  </Tooltip>
                ))}
              </div>
              <div className="relative h-10 mt-2 ml-11 mr-3 shrink-0">
                {dias.map((d, i) => (
                  <span key={d} className={cx('absolute -translate-x-1/2 flex flex-col items-center text-caption leading-snug whitespace-nowrap', i === marcado ? 'text-ink font-semibold' : 'text-ink-2')} style={{ left: `${x(i)}%` }}>
                    <span className="capitalize">{i === n - 1 ? 'Hoje' : diaCurto(d)}</span><span className="num">{diaMes(d)}</span>
                  </span>
                ))}
              </div>
              <table className="sr-only">
                <caption>Utilização da frota por dia</caption>
                <thead><tr><th>Dia</th><th>Utilização</th><th>Veículos que rodaram</th><th>Km</th></tr></thead>
                <tbody>{dias.map((d, i) => <tr key={d}><td>{diaLongo(d)}</td><td>{fmt1(util[i])}%</td><td>{usados[i]} de {total}</td><td>{Math.round(km[i])}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// 5) Por unidade/grupo: tamanho, em movimento agora e utilização média dos 7 dias anteriores (veículo-dias usados ÷
// veículo-dias). Table do sistema: ordenável por coluna, vira cartões no celular.
function Grupos({ className, frota, groups, dias, usadosNo, carregando }: { className: string; frota: ItemFrota[]; groups: any[]; dias: string[]; usadosNo: (dia: string, ids?: Set<string>) => number; carregando: boolean }) {
  const linhas = useMemo(() => {
    const de = (ids: Set<string>, nome: string, id: string) => {
      const n = ids.size;
      const usados = dias.reduce((s, d) => s + usadosNo(d, ids), 0);
      return { id, nome, n, mov: frota.filter((x) => ids.has(x.a.id) && x.k === 'mov').length, util: n && dias.length ? (usados / (n * dias.length)) * 100 : 0 };
    };
    const r = groups.map((g: any) => de(new Set(frota.filter((x) => x.a.groupIds?.includes(g.id)).map((x) => x.a.id)), g.name, g.id)).filter((l) => l.n > 0);
    const sem = new Set(frota.filter((x) => !x.a.groupIds?.some((gid: string) => groups.some((g: any) => g.id === gid))).map((x) => x.a.id));
    if (sem.size && r.length) r.push(de(sem, 'Sem grupo', '_sem'));
    return r.sort((a, b) => b.n - a.n);
  }, [frota, groups, dias, usadosNo]);
  return (
    <Card dense className={className} title="Por unidade e grupo" icon="camadas" subtitle="Veículos em movimento agora e utilização média dos últimos 7 dias">
      <div className="h-full overflow-y-auto"><Table dense head={['Unidade / grupo', 'Veículos', 'Em movimento', 'Utilização (7 dias)']} align={['left', 'right', 'right', 'left']} card={false} minWidth={520} loading={carregando}
        sort={{ 0: (i) => linhas[i].nome, 1: (i) => linhas[i].n, 2: (i) => linhas[i].mov, 3: (i) => linhas[i].util }}
        rows={linhas.map((l) => [
          <span className="font-medium">{l.nome}</span>,
          <span className="num">{l.n}</span>,
          <span className="num">{l.mov}</span>,
          <span className="flex items-center gap-3 min-w-[160px]"><Progress value={l.util / 100} label={`Utilização de ${l.nome}`} className="h-2 flex-1" /><span className="num w-12 text-right font-semibold">{fmt1(l.util)}%</span></span>,
        ])} /></div>
    </Card>
  );
}

// Leitura da semana: uma frase sobre a utilização de hoje contra a média dos 7 dias anteriores. Cartão de destaque na cor de
// dados (--real), sem imagem; a cor marca o cartão, não um status.
function Leitura({ className, carregando, delta, media, hoje }: { className: string; carregando: boolean; delta: number; media: number; hoje: number }) {
  const alta = delta >= 1, queda = delta <= -1;
  const titulo = carregando ? 'Utilização da semana' : alta ? 'Utilização em alta' : queda ? 'Utilização em queda' : 'Utilização estável';
  const texto = carregando ? 'Calculando a comparação com a última semana…'
    : alta ? `A frota operou ${fmt1(delta)} p.p. a mais que a média da última semana.`
    : queda ? `A frota operou ${fmt1(-delta)} p.p. a menos que a média da última semana (${fmt1(media)}%).`
    : `Hoje (${fmt1(hoje)}%) está dentro da média da última semana (${fmt1(media)}%).`;
  return (
    <section className={cx('relative overflow-hidden rounded-card p-card text-white flex flex-col justify-between gap-6 min-h-[180px] lg:min-h-0 shadow-card', className)}
      style={{ background: 'linear-gradient(140deg, color-mix(in srgb, var(--real) 80%, white) 0%, var(--real) 45%, color-mix(in srgb, var(--real) 70%, black) 100%)' }}>
      <span aria-hidden="true" className="absolute -right-24 -bottom-32 w-72 h-72 rounded-full bg-white/[0.08]" />
      <span aria-hidden="true" className="absolute -right-8 -bottom-44 w-72 h-72 rounded-full bg-white/[0.08]" />
      <span aria-hidden="true" className="relative w-11 h-11 rounded-2xl flex items-center justify-center bg-white/[0.18]"><Icon name="tendencia" size={22} className={queda ? '-scale-y-100' : ''} /></span>
      <div className="relative">
        <h2 className="text-h2 font-semibold">{titulo}</h2>
        <p className="mt-2 text-body leading-snug text-white/85">{texto}</p>
      </div>
    </section>
  );
}
