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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore, vehicleStatus } from '../lib/store';
import { useResumoUso } from '../lib/localleApi';
import { Icon, type IconName } from '../components/icons';
import { StatusGlyph, type StatusKind } from '../components/story';
import { Ring, LineChart } from '../components/charts';
import { Button, Card, CardHeader, EmptyState, PageHeader, Progress, Select, Skeleton, Table, Tooltip, cx, FilterSheet } from '../components/ui';
import { fmtT, num } from '@localle/shared/utils';
import { paraUi, rectUi, viewportUi } from '../lib/uiZoom';
import { useCountUp, reducedMotion } from '../lib/motion';

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
  const { ref: tela, encaixe, compacto } = useEncaixe(`${carregando}|${grupo}|${groups.length}|${erro ? 1 : 0}`);

  if (!todos.length) return (
    <div>
      <PageHeader title="Início" />
      <Card><EmptyState size="page" illustration="ilu-busca-veiculo" title="Nenhum veículo rastreado ainda" detail="Vincule um rastreador ao veículo em Ativos para acompanhar a frota aqui." action={<Link to="/ativos"><Button>Abrir ativos</Button></Link>} /></Card>
    </div>
  );

  const gruposComFrota = groups.filter((g: any) => todos.some((a: any) => a.groupIds?.includes(g.id)));
  const mostraGrupos = gruposComFrota.length > 0 && !grupo;

  return (
    <div className="w-full">
      {/* sem a linha de cabeçalho da página (só guardava o filtro e ocupava ~84px que o painel precisa para caber na janela):
          o título fica para o leitor de tela (no celular ele mora no cabeçalho do Layout) e o filtro de grupo vai para o canto
          do cartão de resumo; no celular ele sobe para o cabeçalho (FilterSheet) */}
      <h1 className="sr-only max-md:hidden">Início</h1>
      {erro && <p role="status" className="mb-grid text-small text-ink-2">Não foi possível carregar a atividade e a utilização ({erro}). O estado da frota continua ao vivo.</p>}

      {/* encaixado: altura = o que sobra da janela, e as três faixas (resumo, utilização, grupos) dividem essa altura; --fit
          reduz os números grandes em janela mais baixa; compacto = o degrau antes de desistir. Sem encaixe: altura natural. */}
      <div ref={tela} style={encaixe ? { height: encaixe.altura, marginBottom: 'calc(var(--sp-6) - var(--page-end))', ['--fit' as any]: encaixe.fit } : undefined}
        className={cx('grid grid-cols-1 lg:grid-cols-12', compacto ? 'gap-3' : 'gap-grid', encaixe && 'grid-rows-[auto_minmax(0,1fr)_minmax(0,0.8fr)] [&>*]:min-h-0')}>
        <Resumo className="lg:col-span-7" frota={frota} total={total} compacto={compacto}
          filtro={<FilterSheet count={grupo ? 1 : 0}>{gruposComFrota.length > 0 && <div className="w-[200px] max-md:w-full"><Select aria-label="Grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}
            options={[{ value: '', label: 'Toda a frota' }, ...gruposComFrota.map((g: any) => ({ value: g.id, label: g.name }))]} /></div>}</FilterSheet>} />
        <div className={cx('lg:col-span-5 grid lg:grid-rows-[auto_minmax(0,1fr)] min-h-0', compacto ? 'gap-3' : 'gap-grid')}>
          <Atividade carregando={carregando} uso={hoje ? uso.get(hoje) : undefined} total={total} viagens={viagensOn ? viagensDoDia(trips, hoje, assets) : null} />
          <Conectividade frota={frota} total={total} ultima={ultima} compacto={compacto} />
        </div>
        <Utilizacao className="lg:col-span-12" compacto={compacto} carregando={carregando} dias={dias} util={util} usados={dias.map((d) => usadosNo(d))}
          km={dias.map((d) => soma(uso.get(d), 'km'))} total={total} media={media} delta={delta} />
        {mostraGrupos && <Grupos className="lg:col-span-8" compacto={compacto} frota={frota} groups={gruposComFrota} dias={dias.slice(0, -1)} uso={uso} carregando={carregando} />}
        <Leitura className={mostraGrupos ? 'lg:col-span-4' : 'lg:col-span-12'} compacto={compacto} carregando={carregando} frota={frota} dias={dias.slice(0, -1)} uso={uso}
          delta={delta} media={media} hoje={util[util.length - 1] ?? 0} />
      </div>
    </div>
  );
}

// Encaixe na tela (lg+): o painel ocupa a altura livre da janela abaixo do seu topo, sem rolagem — mas só se o conteúdo
// couber nela. A 1ª faixa (resumo, atividade, conectividade) fica com a altura do próprio conteúdo; o gráfico de utilização
// e a tabela de grupos, que encolhem (e a tabela rola por dentro), dividem o resto. Em degraus: aplica a altura e confere se
// algo transbordou; se sim, tenta o modo compacto (espaços e números menores, subtítulos secundários fora); se ainda não
// couber, desiste (altura natural, a página rola) até a janela ou o conteúdo (`chave`) mudar. Abaixo de lg: altura natural.
// Antes as três faixas dividiam a altura em proporções fixas e a 1ª não cabia num notebook em 100%: o encaixe desistia e a
// página rolava (11/11/2026). Medida em coordenadas da interface (o <html> tem zoom, lib/uiZoom).
const ALTURA_CHEIA = 900; // a partir desta altura livre os números ficam no tamanho cheio; abaixo, encolhem até FIT_MIN
const FIT_MIN = 0.8;
const FIT_MIN_COMPACTO = 0.7;
function useEncaixe(chave: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState<number | null>(null);
  const [nivel, setNivel] = useState(0); // 0 normal · 1 compacto · 2 não coube (altura natural)
  const medir = useCallback(() => {
    const el = ref.current;
    setNivel(0);
    if (!el || !window.matchMedia('(min-width: 1024px)').matches) { setAltura(null); return; }
    setAltura(Math.floor(viewportUi().h - (rectUi(el).top + paraUi(window.scrollY)) - 24));
  }, []);
  useLayoutEffect(() => {
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [medir]);
  useLayoutEffect(medir, [medir, chave]);
  // com a altura aplicada (antes da pintura): o painel ou algum cartão ficou menor que o conteúdo? Rolagem própria (tabela de
  // grupos) não conta — ela existe para isso.
  useLayoutEffect(() => {
    const el = ref.current;
    if (altura == null || nivel >= 2 || !el) return;
    const transborda = (n: Element, prof: number): boolean => [...n.children].some((c) => {
      if (!(c instanceof HTMLElement) || c.getAttribute('aria-hidden') === 'true') return false; // decoração não conta
      const oy = getComputedStyle(c).overflowY;
      if (oy !== 'auto' && oy !== 'scroll' && c.scrollHeight > c.clientHeight + 1) return true;
      return prof < 3 && transborda(c, prof + 1);
    });
    if (el.scrollHeight > el.clientHeight + 1 || transborda(el, 1)) setNivel(nivel + 1);
  }, [altura, nivel]);
  const base = altura == null ? 1 : Math.min(1, altura / ALTURA_CHEIA);
  const encaixe = altura != null && nivel < 2 ? { altura, fit: Math.max(nivel === 1 ? FIT_MIN_COMPACTO : FIT_MIN, base) } : null;
  return { ref, encaixe, compacto: !!encaixe && nivel === 1 };
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
function Resumo({ className, frota, total, compacto, filtro }: { className: string; frota: ItemFrota[]; total: number; compacto?: boolean; filtro?: React.ReactNode }) {
  const conta = (k: string) => frota.filter((x) => x.k === k).length;
  const recentes = frota.filter((x) => x.v && Date.now() - x.v.lastUpdate < RECENTE_MS).length;
  return (
    <Card className={className} dense={compacto} title="Resumo da frota" icon="tendencia" to="/monitoramento" actions={filtro}>
      <div className={cx('flex flex-col justify-between h-full', compacto ? 'gap-3' : 'gap-6')}>
        <div className={cx('flex flex-col', compacto ? 'gap-2' : 'gap-4')}>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <Numero tamanho="xl"><Conta v={total} /></Numero>
            <span className="text-h2 text-ink-2 pb-1">{total === 1 ? 'veículo' : 'veículos'} rastreados</span>
          </div>
          <span className={cx('self-start inline-flex items-center gap-1.5 px-3 rounded-pill bg-card-2 text-small text-ink-2', compacto ? 'h-7' : 'h-8')}>
            <span className="num font-semibold text-ink"><Conta v={pct(recentes, total)} f={fmt1} />%</span> com posição nos últimos 30 min
          </span>
        </div>
        <div className={cx('flex flex-col', compacto ? 'gap-3' : 'gap-5')}>
          <div role="img" aria-label={ESTADOS.map((e) => `${e.label}: ${conta(e.k)}`).join(', ')} className="flex h-2.5 gap-[2px] rounded-pill overflow-hidden bg-track">
            {ESTADOS.map((e, i) => conta(e.k) > 0 && <span key={e.k} className="grow-x" style={{ flexGrow: conta(e.k), background: e.cor, ['--i' as any]: i * 2 }} />)}
          </div>
          <ul className={cx('grid grid-cols-2 sm:grid-cols-4 gap-x-4', compacto ? 'gap-y-2' : 'gap-y-5')}>
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
function Conectividade({ frota, total, ultima, compacto }: { frota: ItemFrota[]; total: number; ultima: number; compacto?: boolean }) {
  const transmitindo = frota.filter((x) => x.v && !x.v.noSignal).length;
  const linhas: { label: string; n: number; kind: StatusKind; dica?: string }[] = [
    { label: 'Transmitindo', n: transmitindo, kind: 'mov' },
    { label: 'Sem comunicação', n: frota.filter((x) => x.v?.noSignal && x.v?.comunicacao !== 'sem_gps').length, kind: 'nosignal', dica: 'O rastreador parou de enviar dados — não é o mesmo que veículo parado.' },
    { label: 'Sem GPS', n: frota.filter((x) => x.v?.comunicacao === 'sem_gps').length, kind: 'parado', dica: 'Envia dados, mas sem posição válida.' },
    { label: 'Aguardando 1ª posição', n: frota.filter((x) => !x.v).length, kind: 'off', dica: 'Rastreador instalado que ainda não mandou posição.' },
  ];
  const visiveis = linhas.filter((l) => l.n > 0 || l.label === 'Transmitindo' || l.label === 'Sem comunicação');
  const p = pct(transmitindo, total);
  return (
    <Card dense title="Conectividade dos rastreadores" icon="sinal" to="/monitoramento"
      subtitle={compacto ? undefined : ultima ? `Última posição às ${fmtT(ultima)} (${haQuanto(ultima)})` : 'Nenhuma posição recebida ainda'}>
      <div className={cx('grid grid-cols-[auto_1fr] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)] items-center gap-x-6', compacto ? 'gap-y-2' : 'gap-y-4')}>
        <div className="max-sm:col-span-2 flex flex-col gap-1.5">
          <Numero tamanho="lg"><Conta v={p} f={fmt1} />%</Numero>
          <span className="text-small text-ink-2">{transmitindo} de {total} transmitindo</span>
        </div>
        <Ring value={p / 100} size={compacto ? 64 : 84} thickness={compacto ? 8 : 10} label="Rastreadores transmitindo" />
        <ul className={cx('flex flex-col min-w-0', compacto ? 'gap-1' : 'gap-2.5')}>
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
// mostram a dica ao passar o cursor/tocar. O gráfico (LineChart do sistema) ocupa a altura do cartão.
function Utilizacao({ className, compacto, carregando, dias, util, usados, km, total, media, delta }: {
  className: string; compacto?: boolean; carregando: boolean; dias: string[]; util: number[]; usados: number[]; km: number[]; total: number; media: number; delta: number;
}) {
  const n = dias.length;
  const piso = n ? Math.max(0, Math.floor((Math.min(...util) - 10) / 10) * 10) : 0;
  const rotulos = dias.map((d, i) => `${i === n - 1 ? 'Hoje' : diaCurto(d).replace(/^./, (c) => c.toUpperCase())}\n${diaMes(d)}`);
  const detalhe = (i: number) => `${usados[i]} de ${total} veículos · ${num(Math.round(km[i]))} km`;
  return (
    <Card dense className={className}>
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-0 h-full">
        <div className={cx('lg:w-[300px] shrink-0 flex flex-col lg:pr-8 lg:border-r border-line', compacto ? 'gap-2' : 'gap-5')}>
          <CardHeader title="Utilização da frota" icon="grafico" subtitle={compacto ? undefined : `Veículos que rodaram ${KM_USADO} km ou mais no dia`} />
          <div className={cx('flex flex-col', compacto ? 'gap-2' : 'gap-3')}>
            {carregando ? <Skeleton className="h-12 w-40" /> : <Numero tamanho="lg"><Conta v={util[n - 1] ?? 0} f={fmt1} />%</Numero>}
            {!carregando && n > 1 && <span className="flex flex-wrap items-center gap-2 text-small text-ink-2"><Variacao delta={delta} /> hoje vs. média dos 7 dias ({fmt1(media)}%)</span>}
          </div>
        </div>
        <div className="flex-1 min-w-0 lg:pl-8 flex flex-col min-h-[220px] lg:min-h-0">
          {carregando ? <Skeleton className="flex-1 w-full" /> : (
            <LineChart height="fill" labels={rotulos} series={[{ label: 'Utilização', values: util, tone: 'real', area: true }]}
              domain={[piso, 100]} format={(v) => `${Number.isInteger(v) ? v : fmt1(v)}%`} mark={n - 1} dots detail={detalhe} tickEvery={1} />
          )}
        </div>
      </div>
    </Card>
  );
}

// 5) Por unidade/grupo: tamanho, em movimento agora e utilização média dos 7 dias anteriores (veículo-dias usados ÷
// veículo-dias). Table do sistema: ordenável por coluna, vira cartões no celular.
function Grupos({ className, compacto, frota, groups, dias, uso, carregando }: { className: string; compacto?: boolean; frota: ItemFrota[]; groups: any[]; dias: string[]; uso: Map<string, UsoDia>; carregando: boolean }) {
  const linhas = useMemo(() => {
    const de = (ids: Set<string>, nome: string, id: string) => {
      const n = ids.size;
      let km = 0;
      for (const d of dias) for (const [aid, x] of uso.get(d) ?? []) if (ids.has(aid)) km += x.km;
      return { id, nome, n, mov: frota.filter((x) => ids.has(x.a.id) && x.k === 'mov').length, km: n && dias.length ? km / (n * dias.length) : 0 };
    };
    const r = groups.map((g: any) => de(new Set(frota.filter((x) => x.a.groupIds?.includes(g.id)).map((x) => x.a.id)), g.name, g.id)).filter((l) => l.n > 0);
    const sem = new Set(frota.filter((x) => !x.a.groupIds?.some((gid: string) => groups.some((g: any) => g.id === gid))).map((x) => x.a.id));
    if (sem.size && r.length) r.push(de(sem, 'Sem grupo', '_sem'));
    return r.sort((a, b) => b.n - a.n);
  }, [frota, groups, dias, uso]);
  const maior = Math.max(1, ...linhas.map((l) => l.km));
  return (
    <Card dense className={className} title="Por unidade e grupo" icon="camadas" subtitle={compacto ? undefined : 'Quanto cada veículo roda por dia, em média, nos últimos 7 dias'}>
      <div className="h-full overflow-y-auto"><Table dense head={['Unidade / grupo', 'Veículos', 'Em movimento', 'Km por veículo/dia']} align={['left', 'right', 'right', 'left']} card={false} minWidth={520} loading={carregando}
        sort={{ 0: (i) => linhas[i].nome, 1: (i) => linhas[i].n, 2: (i) => linhas[i].mov, 3: (i) => linhas[i].km }}
        rows={linhas.map((l) => [
          <span className="font-medium">{l.nome}</span>,
          <span className="num">{l.n}</span>,
          <span className="num">{l.mov}</span>,
          <span className="flex items-center gap-3 min-w-[160px]"><Progress value={l.km / maior} label={`Km por veículo/dia de ${l.nome}`} className="h-2 flex-1" /><span className="num w-16 text-right font-semibold">{num(Math.round(l.km))} km</span></span>,
        ])} /></div>
    </Card>
  );
}

// Leitura da semana: carrossel de frases na cor de dados (--real; a cor marca o cartão, não um status). Cada slide responde
// uma pergunta que nenhum outro cartão da tela responde: quem está sem uso, quem mais rodou e se a semana está acima ou
// abaixo do normal. Troca sozinho a cada LEITURA_MS (pausa com o ponteiro/foco em cima e com prefers-reduced-motion);
// bolinhas e arrasto trocam na mão. Os slides ficam empilhados na mesma célula: a altura é a do maior e não muda ao trocar
// (o encaixe da tela mede a altura do conteúdo).
const LEITURA_MS = 7000;
function Leitura({ className, compacto, carregando, frota, dias, uso, delta, media, hoje }: {
  className: string; compacto?: boolean; carregando: boolean; frota: ItemFrota[]; dias: string[]; uso: Map<string, UsoDia>; delta: number; media: number; hoje: number;
}) {
  const porVeiculo = useMemo(() => frota.map((x) => {
    let km = 0, semUso = 0;
    for (const d of dias) { const k = uso.get(d)?.get(x.a.id)?.km ?? 0; km += k; if (k < KM_USADO) semUso++; }
    return { nome: x.a.name || '—', km, semUso };
  }), [frota, dias, uso]);
  const n = dias.length;
  const lista = (l: string[]) => (l.length <= 3 ? l.join(', ').replace(/, ([^,]*)$/, ' e $1') : `${l.slice(0, 3).join(', ')} e mais ${l.length - 3}`);

  // 1) sem uso
  const parados = porVeiculo.filter((x) => n && x.semUso === n).map((x) => x.nome).sort((a, b) => a.localeCompare(b));
  const algum = porVeiculo.filter((x) => x.semUso > 0).length;
  // 2) quem mais rodou
  const kmTotal = porVeiculo.reduce((s, x) => s + x.km, 0);
  const lider = porVeiculo.reduce<(typeof porVeiculo)[number] | null>((m, x) => (!m || x.km > m.km ? x : m), null);
  // 3) semana × hoje
  const alta = delta >= 1, queda = delta <= -1;

  const slides: { icone: IconName; titulo: string; texto: string; to: string }[] = carregando
    ? [{ icone: 'relogio', titulo: 'Leitura da semana', texto: 'Conferindo o que a frota fez nos últimos 7 dias…', to: '/relatorios/uso' }]
    : [
      {
        icone: 'relogio', to: '/relatorios/uso',
        titulo: parados.length ? `${parados.length} ${parados.length === 1 ? 'veículo parado' : 'veículos parados'} a semana toda` : algum ? 'Nenhum veículo parado a semana toda' : 'Toda a frota rodou todos os dias',
        texto: parados.length ? `${lista(parados)} não ${parados.length === 1 ? 'rodou' : 'rodaram'} nos últimos ${n} dias.`
          : algum ? `${algum} ${algum === 1 ? 'veículo teve' : 'veículos tiveram'} pelo menos um dia sem rodar nos últimos ${n} dias.`
          : `Todos os ${frota.length} veículos rodaram em cada um dos últimos ${n} dias.`,
      },
      ...(lider && lider.km >= KM_USADO ? [{
        icone: 'rota' as IconName, to: '/relatorios/uso',
        titulo: `${lider.nome} foi o que mais rodou`,
        texto: `${num(Math.round(lider.km))} km nos últimos ${n} dias${frota.length > 1 && kmTotal ? `, ${fmt1((lider.km / kmTotal) * 100)}% de tudo o que a frota percorreu` : ''}.`,
      }] : []),
      {
        icone: 'tendencia', to: '/relatorios/uso',
        titulo: alta ? 'Hoje acima da semana' : queda ? 'Hoje abaixo da semana' : 'Hoje dentro do normal',
        texto: alta ? `${fmt1(hoje)}% da frota rodou hoje, ${fmt1(delta)} p.p. acima da média dos últimos ${n} dias (${fmt1(media)}%).`
          : queda ? `${fmt1(hoje)}% da frota rodou hoje, ${fmt1(-delta)} p.p. abaixo da média dos últimos ${n} dias (${fmt1(media)}%).`
          : `${fmt1(hoje)}% da frota rodou hoje, em linha com a média dos últimos ${n} dias (${fmt1(media)}%).`,
      },
    ];

  const [atual, setAtual] = useState(0);
  const [pausado, setPausado] = useState(false);
  const ir = useCallback((i: number) => setAtual(((i % slides.length) + slides.length) % slides.length), [slides.length]);
  const i0 = Math.min(atual, slides.length - 1);
  useEffect(() => {
    if (pausado || slides.length < 2 || reducedMotion()) return;
    const t = window.setTimeout(() => ir(i0 + 1), LEITURA_MS);
    return () => window.clearTimeout(t);
  }, [pausado, slides.length, i0, ir]);
  const arrasto = useRef<number | null>(null);

  return (
    <section aria-roledescription="carrossel" aria-label="Leitura da semana"
      className={cx('relative overflow-hidden rounded-card text-white flex flex-col min-h-[180px] lg:min-h-0 shadow-card touch-pan-y', compacto ? 'p-card-sm gap-2' : 'p-card gap-4', className)}
      style={{ background: 'linear-gradient(140deg, color-mix(in srgb, var(--real) 80%, white) 0%, var(--real) 45%, color-mix(in srgb, var(--real) 70%, black) 100%)' }}
      onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setPausado(false)}
      onPointerDown={(e) => { arrasto.current = e.clientX; }}
      onPointerUp={(e) => { const x0 = arrasto.current; arrasto.current = null; if (x0 != null && Math.abs(e.clientX - x0) > 40) ir(i0 + (e.clientX < x0 ? 1 : -1)); }}>
      {/* círculos numa camada própria, recortada: soltos no cartão, entravam na altura do conteúdo (scrollHeight) e o encaixe
          achava que o cartão transbordava */}
      <span aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        <span className="absolute -right-24 -bottom-32 w-72 h-72 rounded-full bg-white/[0.08]" />
        <span className="absolute -right-8 -bottom-44 w-72 h-72 rounded-full bg-white/[0.08]" />
      </span>
      <div className="relative grid flex-1 min-h-0" aria-live={pausado ? 'polite' : 'off'}>
        {slides.map((s, i) => (
          <div key={s.titulo} aria-roledescription="slide" aria-label={`${i + 1} de ${slides.length}`} aria-hidden={i !== i0}
            {...(i !== i0 ? { inert: '' } : {}) as any}
            className={cx('[grid-area:1/1] flex flex-col justify-between transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none', compacto ? 'gap-2' : 'gap-5')}
            style={{ opacity: i === i0 ? 1 : 0, transform: `translateX(${i === i0 ? 0 : i < i0 ? -24 : 24}px)` }}>
            <span aria-hidden="true" className={cx('w-11 h-11 rounded-2xl flex items-center justify-center bg-white/[0.18]', compacto && 'hidden')}><Icon name={s.icone} size={22} className={s.icone === 'tendencia' && queda ? '-scale-y-100' : ''} /></span>
            <div>
              <h2 className={cx(compacto ? 'text-h3' : 'text-h2', 'font-semibold')}>{s.titulo}</h2>
              <p className="mt-2 text-body leading-snug text-white/85">{s.texto}</p>
            </div>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="relative flex items-center justify-between gap-3">
          <Link to={slides[i0].to} className="text-small font-semibold text-white/90 hover:text-white underline-offset-4 hover:underline outline-none focus-visible:underline">Ver relatório de uso</Link>
          <div className="flex items-center gap-1">
            {slides.map((s, i) => (
              <button key={s.titulo} type="button" onClick={() => ir(i)} aria-label={`Mostrar leitura ${i + 1} de ${slides.length}`} aria-current={i === i0}
                className="w-6 h-6 flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white">
                <span aria-hidden="true" className={cx('h-1.5 rounded-pill bg-white transition-all duration-300', i === i0 ? 'w-5' : 'w-1.5 opacity-50')} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
