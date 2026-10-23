// /design: vitrine de todos os componentes, com os números reais do store.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore, vehicleStatus } from '../lib/store';
import { useNeedsYou } from '../lib/needs';
import { brandVars, brandFallback, contrast } from '../lib/brand';
import { tv } from '../lib/tokens';
import { DAY, HOUR, brl, num } from '@localle/shared/utils';
import { assetKm } from '@localle/shared/km';
import { availability, availabilityWeeks, availabilitySentence, waterfallSentence, weeksSentence, eventMatrix, heatSentence, eventDays, dotSentence, fuelBudgetItems, estSentence, findPatterns, orderTimeline, rangeLabel } from '@localle/shared/insights';
import { OS_STATUS } from '@localle/shared/maint';
import { Button, Badge, Card, Tabs, Pills, PageHeader, Table, Skeleton, EmptyState, ErrorState, Input, Select, Stat, cx, Grid, PageBody } from '../components/ui';
import { Icon, ICON_NAMES } from '../components/icons';
import { Num, IdChip, Plate, DeltaChip, StatusDot, KpiHero, NeedsList, PatternCard, Timeline, ChartCard, PeriodButton, ActionButton, statusKind, type LoadState } from '../components/story';
import { ColumnChart, Waterfall, HeatMatrix, DotMatrix, EstVsReal, ChartLegend } from '../components/charts';
import { BrandMark } from '../components/Layout';
import { SpacingRules } from './DesignSpacing';
import { Section, BrandInComponents, FixedOutsideBrand, Silhouettes, ButtonsAndFields, ChipsStatusDeadlines, CardAnatomy, CardsAndKpis, ChartsGallery, Tables, MapShowcase, StatesGallery, FontComparison } from './DesignSections';
import { KpiRefinementSection } from './design/KpiRefinementSection';

// amostras lidas dos tokens em runtime (styles/tokens.css); a página não repete valores
const SWATCH_GROUPS: [string, string, [string, string][]][] = [
  ['Superfícies e texto', 'Contraste do texto medido sobre o canvas, o pior caso.', [['canvas', '--canvas'], ['card', '--card'], ['card secundário', '--card-2'], ['borda', '--line'], ['borda forte', '--line-strong'], ['texto', '--ink'], ['texto secundário', '--ink-2'], ['texto terciário', '--ink-3'], ['grafite', '--graphite']]],
  ['Status · fixo', 'Ponto + texto, sem fundo. Vermelho só para crítico, erro e ação destrutiva.', [['em movimento', '--mov'], ['parado ligado / atenção', '--warn'], ['crítico', '--crit'], ['erro (texto)', '--crit-ink'], ['atenção (texto)', '--warn-ink']]],
  ['Dado · fixo', 'Azul = realizado, rosa = perda ou desvio, hachura = estimado ou meta. Nunca vermelho em gráfico.', [['realizado', '--real'], ['realizado claro', '--real-soft'], ['perda / desvio', '--loss'], ['perda (texto)', '--loss-ink'], ['variação boa', '--pos'], ['período anterior', '--prev'], ['meta', '--target']]],
  ['Mapa', 'Cores de status só nos veículos. Grupo neutro; cercas na paleta de zonas.', [['grupo de veículos', '--cluster-bg'], ['zona 1 · violeta', '--zone-1'], ['zona 2 · ameixa', '--zone-2'], ['zona 3 · petróleo', '--zone-3'], ['zona 4 · ardósia', '--zone-4']]],
];
const TYPE_SCALE: [string, string, string][] = [['display', 'Número principal da tela', '48.320'], ['kpi', 'Número do card de KPI', '96,2%'], ['title', 'Título de página', 'Visão geral'], ['h2', 'Título de seção', 'Custos do mês'], ['h3', 'Título de card', 'Custo com combustível'], ['body', 'Texto corrido e célula de tabela', 'No ritmo atual, o mês fecha em R$ 50.900.'], ['small', 'Texto secundário e rótulo', 'vs. mês anterior'], ['caption', 'Legenda e microtexto', 'Atualizado em 31/10 às 14:32']];
// classes escritas por extenso para o Tailwind encontrá-las
const TYPE_CLASS: Record<string, string> = { display: 'text-display', kpi: 'text-kpi', title: 'text-title', h2: 'text-h2', h3: 'text-h3', body: 'text-body', small: 'text-small', caption: 'text-caption' };
// cores de revenda simuladas (dados de teste escolhidos pelo cliente, não identidade da plataforma)
// as que pintam primeiro; depois as que caem no grafite, cada uma por um motivo diferente
const REVENDAS = [
  { key: 'atual', label: 'Atual' }, { key: '#0F766E', label: 'Verde-petróleo' }, { key: '#7C3AED', label: 'Roxo' }, { key: '#1E3A8A', label: 'Azul-marinho' }, { key: '#166534', label: 'Verde-escuro' },
  { key: '#DC2626', label: 'Vermelha' }, { key: '#7F1D1D', label: 'Vinho' }, { key: '#F97316', label: 'Laranja' }, { key: '#EAB308', label: 'Amarela' }, { key: '#7DD3FC', label: 'Azul-clara' },
];
const ratio = (a: string, b = '--canvas') => num(contrast(tv(a), tv(b)), 1);
// ordem real das seções na página; usada pela nav e pelo indicador de seção ativa no scroll
const NAV: [string, string][] = [['marca', 'Cor da revenda'], ['tokens', 'Tokens'], ['espacamento', 'Espaçamento e hierarquia'], ['icones', 'Ícones'], ['controles', 'Botões e campos'], ['status', 'Status e prazos'], ['cards', 'Cards e KPIs'], ['refinamento-kpi', 'Refinamento de KPIs'], ['graficos', 'Gráficos'], ['tabelas', 'Tabelas'], ['mapa', 'Mapa'], ['historia', 'Telas de BI'], ['padroes', 'Padrões e detalhe'], ['estados', 'Estados']];
// destaca na nav a seção visível no topo da área de leitura (abaixo da barra fixa)
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-120px 0px -70% 0px', threshold: 0 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids.join('|')]);
  return active;
}

export default function Design() {
  const s = useStore();
  const needs = useNeedsYou();
  const activeSection = useActiveSection(NAV.map(([id]) => id));
  const [rev, setRev] = useState('atual');
  const [st, setSt] = useState<LoadState>('ready');
  const [tab, setTab] = useState('a');
  const [pill, setPill] = useState('7');
  const brandColor = rev === 'atual' ? s.revenda.branding.color : rev;
  const vars = brandVars(brandColor);

  const now = useMemo(() => Date.now(), []);
  const goal = s.maintGoals?.availability ?? 0.95;
  const d = useMemo(() => {
    const from = now - 30 * DAY, pFrom = now - 60 * DAY;
    const cur = availability(s, from, now), prev = availability(s, pFrom, from);
    const weeks = availabilityWeeks(s, 12, now);
    const heat = eventMatrix(s, from, now);
    const dots = eventDays(s, from, now, 'excesso_velocidade');
    const m0 = new Date(now); const fFrom = new Date(m0.getFullYear(), m0.getMonth() - 1, 1).getTime(), fTo = new Date(m0.getFullYear(), m0.getMonth(), 1).getTime() - 1;
    const fuel = fuelBudgetItems(s, fFrom, fTo);
    const lastCorr = [...s.workOrders].filter((w: any) => w.type === 'corretiva' && w.releasedAt).sort((a: any, b: any) => b.releasedAt - a.releasedAt)[0];
    const open = s.workOrders.filter((w: any) => !['concluida', 'cancelada'].includes(w.status));
    return { from, pFrom, cur, prev, weeks, heat, dots, fuel, fFrom, fTo, lastCorr, open, patterns: findPatterns(s, now) };
  }, [s.workOrders, s.events, s.fuelings, s.assets, now]);

  const curPct = d.cur.value == null ? null : d.cur.value * 100;
  const scaleMin = Math.max(0, Math.floor(Math.min(curPct ?? 100, goal * 100) - 2));
  const pts = (v: number) => `${num(v, 1)}%`;
  const ptsDelta = (v: number) => `${v < 0 ? '−' : '+'}${num(Math.abs(v), 2)} p.p.`;
  const espera = d.open.filter((w: any) => ['aberta', 'orcamento', 'aprovada'].includes(w.status));
  const below = d.cur.value != null && d.cur.value < goal;
  const weekMin = Math.min(...d.weeks.map((w) => w.value), goal);
  const nameOf = (id: string) => s.assets.find((a: any) => a.id === id)?.name || '';

  // mesma lista do painel "Precisa de você" (o número bate com o contador da sidebar)
  const needItems = needs.map((n) => ({ id: n.id, icon: n.kind === 'pneu' ? 'pneus' : n.kind === 'veiculo' ? 'alerta' : 'manutencao', tone: 'crit' as const, title: n.title, context: n.detail, to: n.to }));
  const vehicles = s.assets.filter((a: any) => s.vehicles[a.id]).slice(0, 5);

  const tableBlock = st === 'loading' ? <div className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
    : st === 'error' ? <ErrorState detail="A conexão caiu ao buscar a lista de ativos. Seus dados estão salvos." onRetry={() => setSt('ready')} />
    : st === 'empty' ? <EmptyState icon="ativos" title="Nenhum ativo neste filtro" detail="Remova o filtro de grupo ou cadastre o primeiro ativo." action={<Button size="sm"><Icon name="mais" size={16} />Novo ativo</Button>} />
    : <Table minWidth={560} align={['left', 'left', 'left', 'right']} head={['Placa', 'Modelo', 'Status', 'Odômetro']} rows={vehicles.map((a: any) => { const v = s.vehicles[a.id]; const vs = vehicleStatus(v); return [<Plate name={a.name} />, <span>{a.brand} {a.model} <span className="text-ink-3">{a.year?.slice(0, 4)}</span></span>, <StatusDot kind={statusKind(vs.key)} />, <Num value={assetKm(s, a.id)} unit="km" size="body" />]; })} />;

  return (
    <div style={vars as any} className="max-w-[1240px]">
      <PageHeader icon="design" title="Padrões visuais" subtitle="Tokens, ícones e componentes da plataforma, com os dados reais da simulação."
        period={<PeriodButton label={rangeLabel(d.from, now)} compare={rangeLabel(d.pFrom, d.from)}>{(close) => <div className="flex flex-col gap-1 text-small">{['Últimos 30 dias', 'Últimas 12 semanas', 'Este ano'].map((x) => <button key={x} type="button" onClick={close} className="text-left px-3 py-2 rounded-btn hover:bg-card-2">{x}</button>)}<p className="text-caption text-ink-3 px-3 pt-2">Comparando com o período anterior equivalente</p></div>}</PeriodButton>}>
        <Button variant="ghost"><Icon name="filtro" size={18} />Filtros</Button>
        <Button variant="ghost"><Icon name="exportar" size={18} />Exportar</Button>
      </PageHeader>

      <div className="sticky top-0 z-[700] py-stack mb-card-head bg-canvas/95 backdrop-blur flex flex-wrap items-center gap-x-6 gap-y-stack border-b border-line">
        <nav aria-label="Seções" className="flex flex-wrap gap-x-grid gap-y-tight text-small mr-auto">
          {NAV.map(([id, l]) => <a key={id} href={`#/design`} aria-current={activeSection === id ? 'true' : undefined} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }} className={cx('transition-colors', activeSection === id ? 'text-ink font-semibold' : 'link-brand')}>{l}</a>)}
        </nav>
        <span className="flex items-center gap-tight text-small text-ink-2">Dados<Tabs size="sm" tabs={[{ key: 'ready', label: 'Com dados' }, { key: 'loading', label: 'Carregando' }, { key: 'empty', label: 'Vazio' }, { key: 'error', label: 'Erro' }]} value={st} onChange={(k) => setSt(k as LoadState)} /></span>
      </div>

      <PageBody>
      <Section id="marca" title="Cor da revenda" note="A cor da revenda pinta só o botão principal, os controles de seleção (checkbox, radio, toggle, segmentado, aba ativa, paginação), o link, o halo do veículo selecionado e o card de dica (um por tela). Quando falha no contraste (3:1 componente, 4,5:1 texto) ou é vermelha ou laranja, tudo isso vira grafite. Status e dado nunca mudam.">
        <div role="radiogroup" aria-label="Revenda simulada" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-tight">
          {REVENDAS.map((r) => {
            const c = r.key === 'atual' ? s.revenda.branding.color : r.key, fb = brandFallback(c), on = rev === r.key;
            return (
              <button key={r.key} type="button" role="radio" aria-checked={on} aria-label={`${r.label}, ${c.toUpperCase()}, ${fb ? 'cai no grafite' : 'pinta'}`} onClick={() => setRev(r.key)}
                className={cx('flex items-center gap-stack h-12 px-3 rounded-ctl border bg-card text-left transition-colors', on ? 'border-graphite ring-1 ring-graphite' : 'border-line-strong hover:border-line-hover')}>
                <span aria-hidden="true" className="w-6 h-6 rounded-pill shrink-0 border border-line" style={{ background: c }} />
                <span className="flex flex-col min-w-0 mr-auto"><span className="text-small font-medium truncate">{r.label}</span><span className="text-caption text-ink-3 font-mono">{c.toUpperCase()}</span></span>
                <span className={cx('text-caption font-semibold px-2 h-5 rounded-chip inline-flex items-center shrink-0', fb ? 'bg-surface-hover text-ink-2' : 'bg-pos-soft text-pos')}>{fb ? 'grafite' : 'pinta'}</span>
              </button>
            );
          })}
        </div>
        <div role="status" className={cx('flex items-start gap-stack rounded-ctl px-4 py-3 text-body', brandFallback(brandColor) ? 'bg-surface-hover' : 'bg-pos-soft')}>
          <span aria-hidden="true" className="w-5 h-5 rounded-pill shrink-0 mt-hair border border-line" style={{ background: brandColor }} />
          {brandFallback(brandColor)
            ? <p><b className="font-semibold">Cai no grafite.</b> {brandFallback(brandColor)!.replace(/^./, (x) => x.toUpperCase())}. Botão principal, seleção, link, halo e card de dica ficam grafite; o logo continua na cor crua.</p>
            : <p><b className="font-semibold">Pinta.</b> <span className="num">{num(contrast(brandColor, tv('--card')), 1)}:1</span> sobre o card (mínimo 3:1) e texto sobre a cor com <span className="num">{num(Math.max(contrast(brandColor, tv('--card')), contrast(brandColor, tv('--ink'))), 1)}:1</span> (mínimo 4,5:1).</p>}
        </div>
        <Grid split="7/5">
          <BrandInComponents />
          <FixedOutsideBrand />
        </Grid>
      </Section>

      <Section id="tokens" title="Tokens" note="Valores lidos em tempo real de styles/tokens.css. O texto terciário agora passa de 4,5:1 também sobre o canvas.">
        <Card title="Cores">
          <div className="grid gap-8 lg:grid-cols-2">
            {SWATCH_GROUPS.map(([g, note, list]) => (
              <div key={g}>
                <h4 className="text-body font-semibold">{g}</h4><p className="text-caption text-ink-3 mt-hair mb-3">{note}</p>
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {list.map(([n, t]) => <li key={t} className="flex items-center gap-stack min-w-0"><span className="w-9 h-9 rounded-tight border border-line shrink-0" style={{ background: `var(${t})` }} /><span className="flex flex-col min-w-0"><span className="text-small truncate">{n}</span><span className="text-caption font-mono text-ink-3 truncate">{tv(t).toUpperCase()}{/^--(ink|crit-ink|warn-ink|loss-ink|pos)/.test(t) ? ` · ${ratio(t)}:1` : ''}</span></span></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-8">{[['hatch-real', 'Estimado'], ['hatch-loss', 'Perda / excesso'], ['hatch-target', 'Meta / previsto']].map(([c, l]) => <div key={c}><div className={cx('h-14 rounded-ctl', c)} /><p className="text-caption text-ink-2 mt-2"><span className="font-mono">.{c}</span> · {l}</p></div>)}</div>
        </Card>

        <Grid split="6/6">
          <Card title="Tipografia">
            <ul className="flex flex-col divide-y divide-line">
              {TYPE_SCALE.map(([k, use, sample]) => (
                <li key={k} className="py-3 first:pt-0 grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-baseline">
                  <span className={cx(TYPE_CLASS[k], ['display', 'kpi', 'title', 'h2', 'h3'].includes(k) && 'font-semibold', 'truncate')}>{sample}</span>
                  <span className="text-caption text-ink-3 text-right whitespace-nowrap"><span className="font-mono">text-{k}</span> · {tv(`--fs-${k}`)}<br />{use}</span>
                </li>
              ))}
            </ul>
            <p className="text-caption text-ink-3 mt-3">Satoshi. Pesos: 400 texto, 500 rótulos e ênfase, 600 (casado com 700, a Satoshi não tem semibold estático) títulos e números. Abaixo de 12px, só eixo de gráfico (11px).</p>
          </Card>

          <Card title="Números e identificadores">
            <div className="flex flex-col gap-5">
              <div><Num value={48320.4} prefix="R$" digits={2} size="display" /><p className="text-caption text-ink-3 mt-1">size="display" · prefixo e decimais em --num-minor ({tv('--num-minor')})</p></div>
              <div className="flex flex-wrap gap-x-8 gap-y-3 items-baseline"><Num value={curPct} unit="%" digits={1} size="kpi" /><Num value={2.46} unit="km/L" digits={2} size="kpi" /><Num value={1284} size="kpi" /></div>
              <div>
                <table className="w-full text-body"><thead><tr className="text-small text-ink-2 text-left"><th className="font-normal pb-1">Veículo</th><th className="font-normal pb-1 text-right">Custo</th><th className="font-normal pb-1 text-right">Odômetro</th></tr></thead>
                  <tbody>{vehicles.slice(0, 3).map((a: any, i: number) => <tr key={a.id} className="border-t border-line"><td className="py-2"><Plate name={a.name} /></td><td className="py-2 text-right"><Num value={[48320.4, 12580, 3680][i]} prefix="R$" digits={2} size="body" /></td><td className="py-2 text-right"><Num value={assetKm(s, a.id)} unit="km" size="body" /></td></tr>)}</tbody></table>
                <p className="text-caption text-ink-3 mt-1">Valores, datas e horas: fonte normal com algarismos tabulares, alinhados à direita. Nunca mono.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3"><Plate name="KOZ5H91" size="lg" /><Plate name="KOZ5H91" size="lg" state="selected" /><Plate name="PEW1A33" size="lg" state="disabled" /></div>
              <div className="flex flex-wrap items-center gap-2"><IdChip>OS-2026-001245</IdChip><IdChip>868120244591032</IdChip><IdChip>TRK-00123</IdChip><IdChip size="sm">CN-7788</IdChip></div>
              <p className="text-caption text-ink-3 -mt-2">Placa, IMEI e códigos: Geist Mono com zero cortado (0 ≠ O), em chip cinza. Padrão, selecionada (aro escuro) e desabilitada.</p>
            </div>
          </Card>

          <Card title="Espaçamento e alturas">
            <ul className="flex flex-col gap-stack">
              {[['--pad-card', 'respiro do card'], ['--pad-card-sm', 'card compacto'], ['--gap-grid', 'entre cards'], ['--gap-stack', 'entre blocos no card'], ['--gap-section', 'entre seções'], ['--h-ctl', 'botão e campo'], ['--h-ctl-sm', 'botão pequeno, chip'], ['--h-ctl-lg', 'login e celular'], ['--h-row', 'linha de tabela']].map(([t, l]) => (
                <li key={t} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-small"><span className="font-mono text-caption text-ink-2">{t}</span><span className="h-2.5 rounded-pill bg-real-soft"><span className="block h-full rounded-pill bg-real" style={{ width: `var(${t})` }} /></span><span className="text-ink-3 num whitespace-nowrap">{tv(t)} · {l}</span></li>
              ))}
            </ul>
          </Card>

          <Card title="Raios e sombras">
            <ul className="grid grid-cols-3 sm:grid-cols-4 gap-4">
              {[['--r-card', 'card'], ['--r-panel', 'painel'], ['--r-pop', 'popover'], ['--r-btn', 'botão'], ['--r-ctl', 'campo'], ['--r-tight', 'chip de variação'], ['--r-chip', 'placa'], ['--r-pill', 'pílula']].map(([t, l]) => (
                <li key={t} className="flex flex-col items-center gap-tight"><span className="w-16 h-12 bg-card-2 border border-line-strong" style={{ borderRadius: `var(${t})` }} /><span className="text-caption text-ink-2">{l}</span><span className="text-caption text-ink-3 font-mono">{tv(t)}</span></li>
              ))}
            </ul>
            <div className="grid grid-cols-3 gap-4 mt-6">
              {[['--shadow-card', 'card: sem sombra'], ['--shadow-pop', 'popover'], ['--shadow-modal', 'modal']].map(([t, l]) => <div key={t} className="flex flex-col items-center gap-2"><span className="w-full h-14 bg-card border border-line rounded-ctl" style={{ boxShadow: `var(${t})` }} /><span className="text-caption text-ink-2">{l}</span></div>)}
            </div>
            <p className="text-caption text-ink-3 mt-4">Sombra só no que flutua: popover, menu, modal, painel sobre o mapa, marcador.</p>
          </Card>
        </Grid>
        <FontComparison />
      </Section>

      <Section id="espacamento" title="Espaçamento e hierarquia" note="Proximidade, ritmo, um protagonista por card, três níveis de texto, alinhamento e densidade. Cada regra com um exemplo certo e um errado; as telas aplicam tudo pelas primitivas de components/primitives.tsx.">
        <SpacingRules />
      </Section>

      <Section id="icones" title="Ícones" note="Desenhados para a plataforma: grade de 24px, traço de 1,5px, sem fundo.">
        <Card>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1">
            {ICON_NAMES.map((n) => <li key={n} className="flex flex-col items-center gap-2 py-4 rounded-ctl hover:bg-card-2"><Icon name={n} size={24} /><span className="text-caption text-ink-2 font-mono">{n}</span></li>)}
          </ul>
        </Card>
        <Silhouettes />
      </Section>

      <Section id="controles" title="Botões e campos" note="Só o botão principal e os controles marcados seguem a revenda. Campos: foco com borda grafite e anel duplo; erro com mensagem.">
        <ButtonsAndFields />
      </Section>

      <Section id="status" title="Variação, status e prazos" note="Status é ponto + texto, sem fundo. Variação ruim é rosa. Vencido é vermelho; perda consumada, rosa.">
        <ChipsStatusDeadlines />
      </Section>

      <Section id="cards" title="Cards e KPIs" note="Card: ícone + título + ↗ e, no rodapé, a leitura com o motivo da rota. As seis variações de KPI das referências, com os números de exemplo delas.">
        <CardAnatomy />
        <CardsAndKpis st={st} />
      </Section>

      <Section id="refinamento-kpi" title="Refinamento de KPIs" note="Proposta isolada de demonstração: contrato centralizado de polaridade, card de destaque com leitura na cor da marca (fallback grafite) e ranking divergente. Nada aqui está em produção — ver docs/design-audit/07-refinamento-kpi.md.">
        <KpiRefinementSection st={st} />
      </Section>

      <Section id="graficos" title="Gráficos" note="Azul = realizado; azul claro = mesma série fora de destaque; rosa = perda ou desvio; hachura = anterior, estimado ou meta. Nunca vermelho.">
        <ChartsGallery st={st} />
      </Section>

      <Section id="tabelas" title="Tabelas" note="Linha de 48 px, números à direita em fonte tabular, placa em chip, status em ponto + texto. Seleção com fundo neutro; ações no menu ⋯ (excluir separado, em vermelho).">
        <Tables st={st} />
      </Section>

      <Section id="mapa" title="Mapa" note="Disco com seta em qualquer zoom; grupo escuro e neutro; cercas na paleta de zonas. A aparência do veículo fica no card da seleção.">
        <MapShowcase />
      </Section>

      <Section id="historia" title="Telas de BI" note="Número principal → por que está assim → onde agir. As frases são geradas a partir dos dados.">
        <Grid split="5/7">
          <KpiHero title="Disponibilidade da frota" period={`${rangeLabel(d.from, now)} · vs ${rangeLabel(d.pFrom, d.from)}`} value={curPct} unit="%" digits={1}
            delta={{ value: curPct != null && d.prev.value != null ? curPct - d.prev.value * 100 : null }}
            sentence={availabilitySentence(d.cur.value, d.prev.value, goal)} goal={{ value: goal * 100, label: `Meta ${num(goal * 100)}%` }} scale={[scaleMin, 100]}
            rows={[
              { label: 'Horas paradas na oficina', value: <Num value={d.cur.downHours} unit="h" unitClass="text-caption" />, delta: { value: d.cur.downHours - d.prev.downHours, unit: 'h', digits: 0, good: 'down' } },
              { label: 'Paradas por pane', value: d.cur.failures, delta: { value: d.cur.failures - d.prev.failures, unit: '', digits: 0, good: 'down' } },
              { label: 'Tempo médio de reparo', value: d.cur.mttr == null ? '—' : <Num value={d.cur.mttr} unit="h" unitClass="text-caption" /> },
              { label: 'Custo corretivo', value: brl(d.cur.costCorr) },
            ]} />
          <ChartCard title={below ? 'Por que está abaixo da meta' : 'Para onde foi o tempo da frota'} period={rangeLabel(d.from, now)}
            sentence={waterfallSentence(d.cur.causes)} action={espera.length ? { label: `Revisar ${espera.length} OS em espera`, to: '/manutencao' } : { label: 'Ver ordens de serviço', to: '/manutencao' }}
            state={d.cur.causes.length ? 'ready' : 'empty'} empty={{ title: 'Nenhuma parada na oficina', detail: 'Nos últimos 30 dias nenhum veículo ficou parado em manutenção.' }}>
            <div className="pt-6">
              <Waterfall top={{ label: 'Frota toda disponível', value: 100 }} causes={d.cur.causes.map((c) => ({ label: c.label, value: c.pts, detail: `${num(c.hours)} h paradas` }))}
                bottom={{ label: 'Disponibilidade real', value: curPct ?? 0 }} goal={{ value: goal * 100, label: `Meta ${num(goal * 100)}%` }} scale={[scaleMin, 100]} format={pts} formatDelta={ptsDelta} />
            </div>
          </ChartCard>
        </Grid>
        <Grid split="7/5">
          <ChartCard title="Últimas 12 semanas" period="Disponibilidade semanal" sentence={weeksSentence(d.weeks, goal)} aside={<ChartLegend items={[{ kind: 'real-hatch', label: 'Semanas anteriores' }, { kind: 'real', label: 'Semana atual' }]} />}>
            <ColumnChart data={d.weeks.map((w: any) => ({ label: w.label, value: w.value * 100 }))} goal={{ value: goal * 100, label: `Meta ${num(goal * 100)}%` }} floor={Math.max(0, Math.floor(weekMin * 100 - 2))} format={(v) => `${num(v, 1)}%`} height={220} label="Disponibilidade semanal" good="up" />
          </ChartCard>
          <Card title={<>Precisa de você <span className="font-normal text-ink-3 num">{needItems.length}</span></>} icon="atencao">
            <NeedsList items={needItems.slice(0, 6)} />
          </Card>
        </Grid>
        <Grid split="6/6" equal>
          <ChartCard title="Eventos de condução por operação" period={rangeLabel(d.from, now)} sentence={heatSentence(d.heat)} action={{ label: 'Ver ranking de motoristas', to: '/ranking' }} state={d.heat.rows.length ? 'ready' : 'empty'}>
            <HeatMatrix cols={d.heat.cols} rows={d.heat.rows} />
          </ChartCard>
          <ChartCard title="Excessos de velocidade por dia" period={`${rangeLabel(d.from, now)} · vs ${rangeLabel(d.pFrom, d.from)}`} sentence={dotSentence(d.dots, 'excessos de velocidade')}>
            <DotMatrix cur={d.dots.cur} prev={d.dots.prev} labels={d.dots.cur.map((_, i) => String(new Date(d.dots.from + i * DAY).getDate()))} peakLabel={(v) => `Pico · ${v}`} />
          </ChartCard>
        </Grid>
      </Section>

      <Section id="padroes" title="Padrões e detalhe">
        <Grid split="5/7">
          <PatternCard items={d.patterns} />
          <ChartCard title="Combustível: orçamento × gasto" period={new Date(d.fFrom).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} sentence={estSentence(d.fuel)} action={{ label: 'Abrir combustível', to: '/combustivel' }}
            aside={<ChartLegend items={[{ kind: 'real-hatch', label: 'Estimado' }, { kind: 'real', label: 'Realizado' }, { kind: 'loss-hatch', label: 'Excesso' }]} />} state={d.fuel.length ? 'ready' : 'empty'}>
            <EstVsReal items={d.fuel.slice(0, 6)} format={(v) => brl(v).replace(',00', '')} />
          </ChartCard>
        </Grid>
        {d.lastCorr && (
          <Grid split="5/7">
            <Card title={<>O que aconteceu · <span className="font-mono">{nameOf(d.lastCorr.assetId)}</span></>}>
              <Timeline items={orderTimeline(d.lastCorr)} />
            </Card>
            <Card title="Linha do tempo: legenda">
              <div className="flex flex-col gap-stack text-body"><span className="inline-flex items-center gap-2"><span className="w-[10px] h-[10px] rounded-pill bg-real" />No plano: etapa prevista, dentro do esperado</span><span className="inline-flex items-center gap-2"><span className="w-[10px] h-[10px] rounded-pill bg-loss" />Custou: parada não planejada ou atraso</span></div>
              <p className="text-small text-ink-2 mt-card-head">OS #{d.lastCorr.num} · {d.lastCorr.title}</p>
            </Card>
          </Grid>
        )}
      </Section>

      <Section id="estados" title="Estados" note="3D só em vazio e erro de página ou de painel principal; vazio pequeno fica com ícone de linha. Use o seletor Dados no topo para ver carregando, vazio e erro nos cards.">
        <StatesGallery />
        <Grid cols={3}>
          <KpiHero title="Card de KPI" period="últimos 30 dias" value={curPct} unit="%" digits={1} state={st} onRetry={() => setSt('ready')} sentence={availabilitySentence(d.cur.value, d.prev.value, goal)} goal={{ value: goal * 100, label: `Meta ${num(goal * 100)}%` }} scale={[scaleMin, 100]} />
          <Card title="Tabela" className="min-w-0">{tableBlock}</Card>
          <ChartCard title="Gráfico" period="12 semanas" state={st} onRetry={() => setSt('ready')} sentence={weeksSentence(d.weeks, goal)}>
            <ColumnChart data={d.weeks.map((w: any) => ({ label: w.label, value: w.value * 100 }))} goal={{ value: goal * 100, label: `Meta ${num(goal * 100)}%` }} floor={Math.max(0, Math.floor(weekMin * 100 - 2))} format={(v) => `${num(v, 1)}%`} height={180} label="Disponibilidade semanal" good="up" />
          </ChartCard>
        </Grid>
      </Section>
      </PageBody>
    </div>
  );
}
