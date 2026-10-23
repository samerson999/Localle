// /design · vitrine dos componentes da Fase B, com todos os estados. Cada componente novo entra aqui.
// Os números dos gráficos de exemplo seguem as referências visuais (docs/referencias/); placas e posições vêm da simulação.
import { Fragment, useState, type ReactNode } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { useStore, vehicleStatus } from '../lib/store';
import { num } from '@localle/shared/utils';
import { assetKm } from '@localle/shared/km';
import { Button, TextButton, IconButton, Check, Radio, Switch, Tabs, PageTabs, Pills, Pagination, FilterButton, FilterChip, CountBadge, Card, Insight, TipCard, Field, Input, SearchInput, Select, Textarea, Table, Menu, Modal, EmptyState, ErrorState, Illustration, ILLUSTRATION_IDS, Skeleton, toast, confirmAction, Progress, Badge, cx, Grid } from '../components/ui';
import { Section as UISection } from '../components/ui';
import { Icon } from '../components/icons';
import { Num, Plate, IdChip, DeltaChip, StatusDot, StatusLine, Deadline, DeadlineRow, KpiCard, ChartCard, PeriodButton, statusKind, type StatusKind } from '../components/story';
import { ColumnChart, CompareBars, StackedColumns, RankBars, Bar100, LineChart, ProjectionChart, Gauge, Donut, Ring } from '../components/charts';
import { GlideMarker, ClusteredVehicles, FenceShapes, VehicleCard, TILE, ATTR, fenceZone } from '../components/MapBits';
import { AssetSilhouette, SILHOUETTES, glyphOf, silhouetteOf } from '../components/assetArt';

// seção da vitrine: a mesma primitiva das telas (título h2, nota, 16 até o conteúdo, cards a 16)
export function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return <UISection id={id} title={title} description={note}>{children}</UISection>;
}
// rótulo de estado em cima de cada exemplo
const S = ({ children }: { children: ReactNode }) => <p className="text-caption text-ink-3 mb-2">{children}</p>;
const MONTHS = ['mai', 'jun', 'jul', 'ago', 'set', 'out'];
const k = (v: number) => `${num(v / 1000, 1)}k`;
const days = Array.from({ length: 28 }, (_, i) => `${String(i + 1).padStart(2, '0')}/10`);
const wave = (base: number, amp: number, seed: number, n = 28, trend = 0) => Array.from({ length: n }, (_, i) => +(base + trend * i + amp * Math.sin(i * 0.9 + seed) + amp * 0.5 * Math.sin(i * 2.3 + seed * 2)).toFixed(2));

// ---------- cor da revenda nos componentes reais ----------
export function BrandInComponents() {
  const [tab, setTab] = useState('mapa');
  const [on, setOn] = useState(true);
  const [pg, setPg] = useState(0);
  return (
    <Card title="Onde a marca aparece" icon="design">
      <dl className="grid grid-cols-[9.5rem_1fr] gap-y-5 gap-x-4 items-center text-body">
        <dt className="text-ink-2">Botão principal</dt><dd className="flex flex-wrap gap-2"><Button><Icon name="monitoramento" size={18} />Rastrear veículo</Button><Button disabled>Desabilitado</Button></dd>
        <dt className="text-ink-2">Seleção</dt><dd className="flex flex-wrap items-center gap-4"><Check checked label="" aria-label="Marcado" onChange={() => {}} /><Check checked={false} indeterminate aria-label="Parcial" onChange={() => {}} /><Radio name="br" checked label="" onChange={() => {}} /><Switch checked={on} onChange={setOn} aria-label="Ligado" /></dd>
        <dt className="text-ink-2">Segmentado e abas</dt><dd className="flex flex-col gap-3 items-start"><Tabs tabs={[{ key: 'mapa', label: 'Mapa' }, { key: 'lista', label: 'Lista' }, { key: 'alertas', label: 'Alertas', count: 3 }]} value={tab} onChange={setTab} /><PageTabs tabs={[{ key: 'mapa', label: 'Visão geral' }, { key: 'lista', label: 'Ordens de serviço', count: 12 }, { key: 'alertas', label: 'Planos' }]} value={tab} onChange={setTab} /></dd>
        <dt className="text-ink-2">Paginação</dt><dd><Pagination page={pg} pages={5} onChange={setPg} /></dd>
        <dt className="text-ink-2">Link</dt><dd><a href="#/design" className="link-brand">Ver histórico do veículo</a> <span className="text-caption text-ink-3">sublinhado só no fallback</span></dd>
        <dt className="text-ink-2">Halo do selecionado</dt><dd><span aria-hidden="true" className="inline-block w-8 h-8 rounded-pill bg-mov border-2 border-card" style={{ boxShadow: 'var(--shadow-marker-sel)' }} /></dd>
        <dt className="text-ink-2 self-start pt-3">Card de dica</dt><dd><TipCard title="Dica">Combustível 12,5% menor que no mês anterior.</TipCard></dd>
      </dl>
    </Card>
  );
}
export function FixedOutsideBrand() {
  return (
    <Card title="Fixos: não seguem a revenda" icon="cadeado">
      <dl className="grid grid-cols-[9.5rem_1fr] gap-y-4 gap-x-4 items-center text-body">
        <dt className="text-ink-2">Anel de foco</dt><dd className="flex flex-wrap gap-3"><span className="inline-flex h-ctl px-4 items-center rounded-btn bg-card border border-line-strong font-medium" style={{ outline: '2px solid var(--focus-outer)', outlineOffset: 2, boxShadow: '0 0 0 2px var(--focus-inner)' }}>Em foco</span><span className="inline-flex h-ctl px-4 items-center rounded-btn bg-graphite text-on-dark font-medium" style={{ outline: '2px solid var(--focus-outer)', outlineOffset: 2, boxShadow: '0 0 0 2px var(--focus-inner)' }}>Sobre grafite</span></dd>
        <dt className="text-ink-2">Contadores</dt><dd className="flex items-center gap-3"><span className="inline-flex items-center gap-tight">Precisa de você<span className="min-w-[20px] h-5 px-2 rounded-pill bg-[var(--counter-crit-bg)] text-[var(--counter-crit-ink)] text-caption font-semibold inline-flex items-center justify-center num">4</span></span><span className="inline-flex items-center gap-tight">Filtros<CountBadge n={2} /></span></dd>
        <dt className="text-ink-2">Status</dt><dd className="flex flex-wrap gap-x-4 gap-y-2"><StatusDot kind="mov" /><StatusDot kind="parado" /><StatusDot kind="off" /><StatusDot kind="nosignal" /><StatusDot kind="crit" /></dd>
        <dt className="text-ink-2">Dado</dt><dd className="flex flex-wrap gap-2"><DeltaChip value={12.5} unit="%" /><DeltaChip value={8.4} unit="%" good="down" /></dd>
      </dl>
    </Card>
  );
}

// ---------- silhuetas ----------
export function Silhouettes() {
  return (
    <Card title="Silhuetas de ativos" icon="ativos">
      <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
        {SILHOUETTES.map((c) => <li key={c.key} className="flex flex-col items-center gap-2 py-2"><AssetSilhouette category={c.key} className="w-28 h-12 text-ink-3" /><span className="text-small text-ink-2 text-center">{c.label}</span></li>)}
      </ul>
      <div className="flex flex-wrap items-end gap-6 mt-6 pt-5 border-t border-line">
        {[[40, 18, 'tabela'], [64, 28, 'card compacto'], [112, 49, 'card do veículo'], [160, 70, 'destaque']].map(([w, h, l]) => <div key={w} className="flex flex-col items-center gap-1"><span style={{ width: w as number, height: h as number }} className="block"><AssetSilhouette category="caminhao" className="w-full h-full text-ink-3" /></span><span className="text-caption text-ink-3 num">{w}×{h} · {l}</span></div>)}
      </div>
      <p className="text-caption text-ink-3 mt-3">Cheias, vista lateral, frente para a direita, moldura 64×28 com chão comum: alinham em tabela. Carroceria a 70%, rodas cheias, janelas vazadas.</p>
    </Card>
  );
}

// ---------- botões e campos ----------
export function ButtonsAndFields() {
  const [q, setQ] = useState('KOZ');
  const [sel, setSel] = useState('Recife - PE');
  const [period, setPeriod] = useState('30');
  const [filters, setFilters] = useState(['Recife - PE', 'Em movimento', 'SUV']);
  return (
    <Grid split="6/6">
      <Card title="Botões" icon="mais">
        <div className="grid grid-cols-[7rem_1fr] gap-y-3 gap-x-4 items-center">
          {([['primary', 'Principal'], ['secondary', 'Secundário'], ['quiet', 'Discreto'], ['dark', 'Grafite'], ['danger', 'Destrutivo']] as const).map(([v, l]) => (
            <Fragment key={v}><span className="text-small text-ink-2">{l}</span>
              <div className="flex flex-wrap gap-2">
                <Button variant={v}>{v === 'danger' ? <><Icon name="excluir" size={18} />Excluir</> : v === 'primary' ? <><Icon name="mais" size={18} />Adicionar</> : l}</Button>
                <Button variant={v} loading>{l}</Button>
                <Button variant={v} disabled>{l}</Button>
              </div></Fragment>
          ))}
          <span className="text-small text-ink-2">Tamanhos</span><div className="flex flex-wrap items-center gap-2"><Button size="sm">Pequeno</Button><Button>Médio</Button><Button size="lg">Grande</Button></div>
          <span className="text-small text-ink-2">Texto e ícone</span><div className="flex flex-wrap items-center gap-3"><Button variant="link">Ver detalhes</Button><TextButton>Editar</TextButton><TextButton tone="danger">Remover</TextButton><IconButton aria-label="Centralizar" tone="outline"><Icon name="centralizar" /></IconButton><IconButton aria-label="Camadas" tone="outline"><Icon name="camadas" /></IconButton><IconButton aria-label="Mais opções"><Icon name="mais-opcoes" /></IconButton></div>
        </div>
        <p className="text-caption text-ink-3 mt-4">Carregando: girador + aria-busy. Desabilitado: 45% de opacidade, sem cursor de clique. Só o principal segue a revenda.</p>
      </Card>
      <Card title="Campos" icon="editar">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Padrão"><Input placeholder="Digite…" /></Field>
          <Field label="Preenchido" hint="Foco: borda grafite e anel duplo"><Input defaultValue="KOZ5H91" /></Field>
          <Field label="Erro" error="Campo obrigatório" required><Input invalid placeholder="Digite…" /></Field>
          <Field label="Desabilitado"><Input disabled placeholder="Digite…" /></Field>
          <Field label="Seleção"><Select value={sel} onChange={(e) => setSel(e.target.value)} options={['Recife - PE', 'Jaboatão - PE', 'Olinda - PE', 'Cabo - PE', 'Paulista - PE']} /></Field>
          <Field label="Data"><Input type="date" defaultValue="2026-10-28" /></Field>
          <Field label="Busca" className="sm:col-span-2"><SearchInput value={q} onChange={setQ} placeholder="Buscar veículo, placa…" /></Field>
          <Field label="Observação" className="sm:col-span-2"><Textarea rows={2} placeholder="Texto livre" /></Field>
        </div>
        <div className="mt-5 pt-4 border-t border-line flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2"><PeriodButton label="1–28 out" compare="1–28 set">{(close) => <div className="flex flex-col gap-1 text-body">{[['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']].map(([key, l]) => <button key={key} type="button" onClick={() => { setPeriod(key); close(); }} className={cx('text-left px-3 py-2 rounded-btn hover:bg-card-2', period === key && 'font-semibold')}>{l}</button>)}</div>}</PeriodButton>
            <FilterButton label="Unidade" icon="filtro" /><FilterButton label="Status" count={2} active /><FilterButton label="Tipo" /><FilterButton label="Mais" icon="mais" /></div>
          <div className="flex flex-wrap gap-2">{filters.map((f) => <FilterChip key={f} label={f} onRemove={() => setFilters(filters.filter((x) => x !== f))} />)}{!filters.length && <TextButton onClick={() => setFilters(['Recife - PE', 'Em movimento', 'SUV'])}>Restaurar filtros</TextButton>}</div>
        </div>
      </Card>
      <Card title="Seleção" icon="checklist">
        <SelectionDemo />
      </Card>
      <Card title="Paginação" icon="ordenar">
        <PaginationDemo />
      </Card>
    </Grid>
  );
}
function SelectionDemo() {
  const [c, setC] = useState({ a: false, b: true });
  const [r, setR] = useState('b');
  const [sw, setSw] = useState({ a: true, b: false });
  const [t, setT] = useState('semana');
  const [p, setP] = useState('todos');
  return (
    <div className="grid sm:grid-cols-3 gap-6">
      <div className="flex flex-col gap-3"><S>Checkbox</S><Check label="Não selecionado" checked={c.a} onChange={(v) => setC({ ...c, a: v })} /><Check label="Selecionado" checked={c.b} onChange={(v) => setC({ ...c, b: v })} /><Check label="Indeterminado" checked={false} indeterminate onChange={() => {}} /><Check label="Desabilitado" checked disabled onChange={() => {}} /><Check label="Com descrição" description="Avisa 30 dias antes" checked={c.a} onChange={(v) => setC({ ...c, a: v })} /></div>
      <div className="flex flex-col gap-3"><S>Radio</S>{['a', 'b'].map((k2) => <Radio key={k2} name="demo-r" label={k2 === 'a' ? 'Não selecionado' : 'Selecionado'} checked={r === k2} onChange={() => setR(k2)} />)}<Radio name="demo-r2" label="Desabilitado" checked disabled onChange={() => {}} /></div>
      <div className="flex flex-col gap-3"><S>Toggle</S>
        <label className="flex items-center justify-between gap-3 text-body">Ativado<Switch checked={sw.a} onChange={(v) => setSw({ ...sw, a: v })} /></label>
        <label className="flex items-center justify-between gap-3 text-body">Desativado<Switch checked={sw.b} onChange={(v) => setSw({ ...sw, b: v })} /></label>
        <label className="flex items-center justify-between gap-3 text-body text-ink-3">Desabilitado<Switch checked disabled onChange={() => {}} /></label>
      </div>
      <div className="sm:col-span-3 flex flex-col gap-3 pt-4 border-t border-line">
        <S>Controle segmentado (padrão e pequeno) e pílulas</S>
        <Tabs tabs={[{ key: 'dia', label: 'Dia' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mês' }, { key: 'ano', label: 'Ano' }]} value={t} onChange={setT} />
        <Tabs size="sm" tabs={[{ key: 'todos', label: 'Todos', count: 48 }, { key: 'mov', label: 'Em movimento', count: 31 }, { key: 'par', label: 'Parado', count: 9 }]} value={p} onChange={setP} />
        <Pills options={[{ key: 'todos', label: 'Todos' }, { key: 'mov', label: 'Em movimento' }, { key: 'par', label: 'Parado' }]} value={p} onChange={setP} />
      </div>
    </div>
  );
}
function PaginationDemo() {
  const [a, setA] = useState(0); const [b, setB] = useState(0); const [c, setC] = useState(3);
  return (
    <div className="flex flex-col gap-5">
      <div><S>Padrão</S><Pagination page={a} pages={5} onChange={setA} /></div>
      <div><S>Compacta</S><Pagination page={b} pages={3} onChange={setB} compact /></div>
      <div><S>Com texto e reticências</S><Pagination page={c} pages={10} onChange={setC} total={48 * 2} pageSize={10} /></div>
    </div>
  );
}

// ---------- variação, status, placas e prazos ----------
export function ChipsStatusDeadlines() {
  const s = useStore();
  const vs = s.assets.filter((a: any) => s.vehicles[a.id]).slice(0, 5);
  const now = Date.now(), D = 86400000;
  const date = (t: number) => new Date(t).toLocaleDateString('pt-BR');
  const kinds: [StatusKind, string][] = [['mov', '78 km/h · há 2 min'], ['parado', 'há 18 min'], ['off', 'há 3 h'], ['nosignal', 'há 2 h'], ['crit', 'Bateria baixa']];
  return (
    <Grid cols={3}>
      <Card title="Chips de variação" icon="tendencia">
        <div className="flex flex-col gap-4">
          <div><S>Boa · ruim · estável</S><div className="flex flex-wrap gap-2"><DeltaChip value={12.5} unit="%" /><DeltaChip value={8.4} unit="%" /><DeltaChip value={-8.4} unit="%" /><DeltaChip value={0} unit="%" /></div></div>
          <div><S>Custo (good="down"): cair é bom</S><div className="flex flex-wrap gap-2"><DeltaChip value={-12.5} unit="%" good="down" /><DeltaChip value={28.4} unit="%" good="down" /></div></div>
          <div><S>Pontos percentuais</S><div className="flex flex-wrap gap-2"><DeltaChip value={2.1} /><DeltaChip value={-3.7} /></div></div>
          <div><S>Tamanhos</S><div className="flex flex-wrap items-center gap-2"><DeltaChip value={12.5} unit="%" size="lg" /><DeltaChip value={12.5} unit="%" /><DeltaChip value={12.5} unit="%" size="sm" /></div></div>
        </div>
        <p className="text-caption text-ink-3 mt-4">Piorou é rosa, nunca vermelho. A seta mostra a direção; a cor, se foi bom.</p>
      </Card>
      <Card title="Status de veículo" icon="monitoramento">
        <ul className="flex flex-col">
          {kinds.map(([kd, sub], i) => <li key={kd} className="flex items-center gap-3 py-3 border-t border-line first:border-t-0"><Plate name={vs[i]?.name || 'KOZ5H91'} /><StatusLine kind={kd} sub={sub} /></li>)}
        </ul>
        <div className="mt-3 pt-3 border-t border-line flex flex-wrap gap-2 items-center"><Plate name="KOZ5H91" size="sm" /><Plate name="KOZ5H91" state="selected" /><Plate name="PEW1A33" state="disabled" /><IdChip>OS-04567</IdChip></div>
      </Card>
      <Card title="Prazos e vencimentos" icon="calendario">
        <DeadlineRow icon="calendario" title="Licenciamento" sub="CRLV 2026" kind="ok" label="Em dia" date={date(now + 300 * D)} />
        <DeadlineRow icon="manutencao" title="Revisão preventiva" sub="10.000 km" kind="soon" label="Em 2 dias" date={date(now + 2 * D)} />
        <DeadlineRow icon="documento" title="Seguro" sub="Apólice" kind="today" label="Hoje" date={date(now)} />
        <DeadlineRow icon="pneus" title="Troca de pneus" sub="Vida útil" kind="overdue" label="Vencido" date={date(now - 38 * D)} />
        <DeadlineRow icon="multas" title="Indicação de condutor" sub="Prazo perdido" kind="lost" label="Perdido" date={date(now - 5 * D)} />
        <p className="text-caption text-ink-3 mt-3">Vencido (ainda dá para agir) é vermelho; perda consumada é rosa.</p>
      </Card>
    </Grid>
  );
}

// ---------- cards: anatomia, KPIs (6 variações), card do veículo ----------
export function CardsAndKpis({ st }: { st: 'ready' | 'loading' | 'empty' | 'error' }) {
  const s = useStore();
  const plates = s.assets.filter((a: any) => s.vehicles[a.id]).slice(0, 5).map((a: any) => a.name);
  const ok = st === 'ready';
  const avail = wave(94.5, 1.1, 1, 28, 0.08).map((v) => Math.min(99.5, v));
  return (
    <>
      <Grid cols={3}>
        <KpiCard state={st} icon="banco" title="Custo com combustível" to="/combustivel" value={ok ? 24680.5 : null} prefix="R$" digits={2} sub="Total do mês · até 28/10" delta={{ value: -12.5, unit: '%', good: 'down' }} compare="vs. set" insight="12,5% menor que o mês anterior." insightTo="/combustivel">
          <ColumnChart data={[28.4, 27.1, 25.6, 26.8, 28.2, 24.7].map((v, i) => ({ label: MONTHS[i], value: v * 1000 }))} format={k} height={150} label="Custo com combustível" />
        </KpiCard>
        <KpiCard state={st} icon="manutencao" title="Manutenções corretivas" to="/manutencao" value={ok ? 8942.3 : null} prefix="R$" digits={2} sub="Total do mês · até 28/10" delta={{ value: 28.4, unit: '%', good: 'down' }} compare="vs. set" insight="28,4% maior que o mês anterior." insightTo="/manutencao">
          <ColumnChart data={[5.2, 6.1, 6.8, 7.4, 7.0, 8.9].map((v, i) => ({ label: MONTHS[i], value: v * 1000 }))} format={k} height={150} label="Manutenções corretivas" />
        </KpiCard>
        <KpiCard state={st} icon="alvo" title="Disponibilidade da frota" to="/manutencao" value={ok ? 96.2 : null} unit="%" digits={1} sub="Meta: 95,0%" delta={{ value: 2.1 }} compare="vs. set" insight="Acima da meta nos últimos 14 dias.">
          <LineChart labels={days} series={[{ label: 'Disponibilidade', values: avail, tone: 'real', area: true }]} goal={{ value: 95 }} domain={[85, 100]} format={(v) => `${num(v)}%`} height={150} />
        </KpiCard>
        <KpiCard state={st} icon="grafico" title="Consumo médio da frota" to="/combustivel" value={ok ? 7.8 : null} unit="km/L" digits={1} sub="Média do mês · até 28/10" delta={{ value: 6.8, unit: '%' }} compare="vs. set" insight="Acima da média do mês anterior (7,3 km/L).">
          <RankBars items={plates.map((p: string, i: number) => ({ label: p, value: [12.4, 10.1, 8.7, 7.3, 5.9][i] }))} format={(v) => num(v, 1)} />
        </KpiCard>
        <KpiCard state={st} icon="relogio" title="Viagens realizadas" to="/viagens" value={ok ? 1284 : null} sub="Total do mês · até 28/10" delta={{ value: 14.2, unit: '%' }} compare="vs. set" insight="14,2% mais viagens que no mês anterior." insightTo="/viagens">
          <LineChart labels={days} series={[{ label: 'Viagens', values: wave(70, 22, 3, 28, 0.9).map(Math.round), tone: 'real', area: true }]} height={150} format={(v) => num(v)} />
        </KpiCard>
        <KpiCard state={st} icon="escudo" title="Veículos com alerta" to="/monitoramento/alertas" value={ok ? 12 : null} sub="Veículos com alertas ativos" status={{ kind: 'crit', label: 'Crítico', detail: 'Exige ação' }} insight="3 veículos a mais que no mês anterior.">
          <ColumnChart data={[5, 6, 8, 7, 9, 12].map((v, i) => ({ label: MONTHS[i], value: v }))} height={150} label="Veículos com alerta" />
        </KpiCard>
      </Grid>
      <p className="text-caption text-ink-3 mt-3">A barra em destaque é sempre azul de dado, mesmo quando o resultado piorou (corretivas, alertas): quem diz bom ou ruim é o chip. Troque o estado em "Estados" para ver carregando, vazio e erro nos seis.</p>
    </>
  );
}
export function CardAnatomy() {
  const s = useStore();
  const a = s.assets.find((x: any) => s.vehicles[x.id]);
  const v = a && s.vehicles[a.id];
  const vs = v ? vehicleStatus(v) : null;
  return (
    <Grid cols={3}>
      <Card title="Anatomia do card" icon="grafico" to="/design" footer={<Insight to="/design">A frase da leitura vem no rodapé, com o motivo da rota.</Insight>}>
        <ol className="flex flex-col gap-2 text-small text-ink-2 list-decimal pl-4">
          <li>Ícone de linha e título (text-h3).</li><li>↗ abre o detalhe (to ou onOpen).</li><li>Conteúdo: número, gráfico ou lista.</li><li>Rodapé: motivo da rota + frase + ›.</li>
        </ol>
      </Card>
      <Card title="Card compacto" icon="relogio" dense>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-start gap-2"><Icon name="rota" size={20} className="text-ink-2 mt-1" /><div><Num value={156} unit="km" size="lg" /><p className="text-caption text-ink-3">Percurso</p></div></div>
          <div className="flex items-start gap-2"><Icon name="combustivel" size={20} className="text-ink-2 mt-1" /><div><Num value={7.8} unit="km/L" digits={1} size="lg" /><p className="text-caption text-ink-3">Consumo médio</p></div></div>
          <div className="flex items-start gap-2"><Icon name="relogio" size={20} className="text-ink-2 mt-1" /><div><p className="text-[28px] leading-[1.1] font-semibold num">4h32</p><p className="text-caption text-ink-3">Motor ligado</p></div></div>
          <div className="flex items-start gap-2"><Icon name="play" size={20} className="text-ink-2 mt-1" /><div><p className="text-[28px] leading-[1.1] font-semibold num">2h18</p><p className="text-caption text-ink-3">Em movimento</p></div></div>
        </div>
      </Card>
      {a && v && vs && (
        <VehicleCard plate={a.name} silhouette={silhouetteOf(a)} photo={a.photo} model={[a.brand, a.model, a.year?.slice(0, 4)].filter(Boolean).join(' · ')} place="Recife - PE" kind={statusKind(vs.key)} statusSub={`${num(v.speed || 0)} km/h`}
          metrics={[{ icon: 'velocimetro', value: `${num(v.speed || 0)} km/h`, label: 'Velocidade' }, { icon: 'odometro', value: `${num(assetKm(s, a.id))} km`, label: 'Odômetro' }, { icon: 'combustivel', value: '75%', label: 'Combustível' }]}
          actions={[{ icon: 'monitoramento', label: 'Rastrear' }, { icon: 'historico', label: 'Histórico' }, { icon: 'comando', label: 'Comandos' }, { icon: 'mais-opcoes', label: 'Mais' }]} onClose={() => {}} />
      )}
    </Grid>
  );
}

// ---------- gráficos ----------
export function ChartsGallery({ st }: { st: 'ready' | 'loading' | 'empty' | 'error' }) {
  const s = useStore();
  const plates = s.assets.filter((a: any) => s.vehicles[a.id]).slice(0, 6).map((a: any) => a.name);
  const cum = days.slice(0, 31).map((_, i) => 1650 * (i + 1) + 300 * Math.sin(i));
  const actual = cum.slice(0, 22);
  const projected = actual[actual.length - 1] / 22 * 28;
  return (
    <Grid cols={3}>
      <ChartCard state={st} icon="grafico" title="Rendimento de combustível" period="Últimos 6 meses" to="/combustivel" insight="De maio a outubro: 2,12 → 2,46 km/L.">
        <ColumnChart data={[2.12, 2.28, 2.31, 2.37, 2.42, 2.46].map((v, i) => ({ label: MONTHS[i], value: v }))} format={(v) => num(v, 2)} label="km/L" />
      </ChartCard>
      <ChartCard state={st} icon="grafico" title="Custo de manutenção" period="Setembro → outubro · R$ mil" to="/manutencao" insight="A corretiva subiu R$ 3,7 mil de set. para out.">
        <CompareBars groups={[{ label: 'Preventiva', prev: 23.8, cur: 24.9 }, { label: 'Corretiva', prev: 14.9, cur: 18.6 }]} format={(v) => num(v, 1)} prevLabel="Setembro" curLabel="Outubro" />
      </ChartCard>
      <ChartCard state={st} icon="grafico" title="Manutenção por tipo" period="Preventiva + corretiva · R$ mil" to="/manutencao" insight="Em outubro, corretivas: R$ 18,6 mil (42,8%).">
        <StackedColumns data={[[17, 11.4], [19, 13.1], [21.5, 14.3], [24.5, 16.7], [22.8, 15.9], [24.9, 18.6]].map((v, i) => ({ label: MONTHS[i], values: v }))} series={[{ label: 'Preventiva', tone: 'real' }, { label: 'Corretiva', tone: 'loss' }]} format={(v) => num(v, 1)} />
      </ChartCard>
      <ChartCard state={st} icon="ranking" title="Rendimento por veículo" period="km/L · maior rendimento primeiro" to="/ranking" insight={`${plates[0]} lidera com 3,21 km/L.`}>
        <RankBars items={plates.map((p: string, i: number) => ({ label: p, value: [3.21, 2.89, 2.46, 2.31, 2.12, 1.98][i] }))} format={(v) => num(v, 2)} />
      </ChartCard>
      <ChartCard state={st} icon="alvo" title="Rendimento mensal" period="Meta mensal: 2,50 km/L" insight="Outubro ficou 0,04 km/L abaixo da meta.">
        <ColumnChart data={[2.12, 2.28, 2.31, 2.37, 2.42, 2.46].map((v, i) => ({ label: MONTHS[i], value: v }))} format={(v) => num(v, 2)} goal={{ value: 2.5, label: 'Meta 2,50' }} label="km/L" />
      </ChartCard>
      <ChartCard state={st} icon="velocimetro" title="Distribuição de RPM" period="Tempo de funcionamento por faixa" insight="8% do tempo em RPM excessiva (acima de 2.400).">
        <p className="mb-4"><Num value={68} unit="%" size="kpi" /> <span className="text-small text-ink-2">na faixa ideal</span></p>
        <Bar100 parts={[{ label: 'Ideal', detail: '800–1.800 rpm', value: 68, tone: 'real-muted' }, { label: 'Alta', detail: '1.800–2.400 rpm', value: 24, tone: 'real' }, { label: 'Excessiva', detail: '> 2.400 rpm', value: 8, tone: 'loss' }]} />
      </ChartCard>
      <ChartCard state={st} icon="tendencia" title="Consumo médio (km/L)" period="Atual × período anterior" insight="Consumo 8,6% maior que no período anterior.">
        <LineChart labels={days} series={[{ label: 'Atual', values: wave(7.4, 0.5, 2, 28, 0.04), tone: 'real', area: true }, { label: 'Período anterior', values: wave(6.2, 0.5, 5, 28, 0.05), tone: 'prev' }]} format={(v) => num(v)} domain={[0, 12]} />
      </ChartCard>
      <ChartCard state={st} icon="dinheiro" title="Custo da frota no mês" period="Acumulado, projeção e orçamento" insight="No ritmo atual, o mês fecha abaixo do orçamento.">
        <ProjectionChart labels={days} actual={actual} projected={projected} budget={{ value: 52000 }} format={(v) => `R$ ${num(v / 1000)} mil`} />
      </ChartCard>
      <ChartCard state={st} icon="alvo" title="Disponibilidade" period="Meta 95%" insight="2,1 p.p. acima do período anterior.">
        <div className="flex justify-center pt-2"><Gauge value={92.4} goal={95} label="da frota disponível" /></div>
      </ChartCard>
      <ChartCard state={st} icon="composicao" title="Status da frota" period="Agora" to="/monitoramento" insight="49% da frota em movimento (412 veículos)." className="lg:col-span-2">
        <Donut center={<Num value={842} size="kpi" />} centerLabel="veículos" parts={[{ label: 'Em movimento', value: 412, color: 'var(--mov)', kind: 'mov' }, { label: 'Parado ligado', value: 189, color: 'var(--warn)', kind: 'parado' }, { label: 'Desligado', value: 126, color: 'var(--ink-3)', kind: 'off' }, { label: 'Sem sinal', value: 73, color: 'var(--line-hover)', kind: 'nosignal' }, { label: 'Crítico', value: 42, color: 'var(--crit)', kind: 'crit' }]} />
      </ChartCard>
      <ChartCard state={st} icon="alvo" title="Disponibilidade da frota" period="Agora" insight="Disponibilidade 2,1 p.p. maior que no período anterior.">
        <div className="flex flex-wrap items-center gap-6">
          <Ring value={0.962} center={<Num value={96.2} unit="%" digits={1} size="lg" />} centerLabel="disponível" label="Disponibilidade" />
          <dl className="flex flex-col gap-2 text-small"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-pill bg-real" /><dt className="mr-3">Disponível</dt><dd className="num font-semibold ml-auto">809</dd></div><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-pill bg-track" /><dt className="mr-3">Indisponível</dt><dd className="num font-semibold ml-auto">33</dd></div></dl>
        </div>
      </ChartCard>
    </Grid>
  );
}

// ---------- tabelas ----------
export function Tables({ st }: { st: 'ready' | 'loading' | 'empty' | 'error' }) {
  const s = useStore();
  const all = s.assets.filter((a: any) => s.vehicles[a.id]).slice(0, 6);
  const list = st === 'empty' ? [] : all;
  const [selRaw, setSel] = useState<Set<string>>(new Set([all[0]?.id]));
  const sel = st === 'empty' ? new Set<string>() : selRaw;
  const allOn = list.length > 0 && list.every((a: any) => sel.has(a.id));
  const toggle = (id: string) => { const n = new Set(selRaw); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const menu = (a: any) => <Menu label={`Ações de ${a.name}`} items={[{ label: 'Ver detalhes', icon: 'visualizar', onClick: () => toast(`Detalhes de ${a.name}`) }, { label: 'Comandos', icon: 'comando', onClick: () => {} }, { label: 'Histórico', icon: 'historico', onClick: () => {} }, { label: 'Editar', icon: 'editar', onClick: () => {} }, { label: 'Excluir', icon: 'excluir', danger: true, onClick: () => confirmAction({ title: `Excluir ${a.name}?`, detail: 'O histórico do veículo continua nos relatórios.' }) }]} />;
  const progress = [0.7, 0.4, 0.15, 1, 0, 0.55];
  const prazo: [any, string][] = [['soon', 'Em 2 dias'], ['today', 'Hoje'], ['ok', '12/11/2026'], ['ok', '—'], ['overdue', 'Vencido'], ['soon', 'Em 9 dias']];
  const slice = (n: number) => all.slice(0, n);
  return (
    <div className="flex flex-col gap-grid">
      <Card title="Frota · seleção, status e ações" icon="ativos" actions={sel.size > 0 ? <span className="text-small text-ink-2">{sel.size} selecionados</span> : undefined}>
        {st === 'error' ? <ErrorState detail="A conexão caiu ao buscar a lista de veículos. Seus dados estão salvos." onRetry={() => {}} />
          : <Table loading={st === 'loading'} minWidth={760} align={['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right']}
            emptyState={<EmptyState illustration="ilu-busca-veiculo" layout="row" title="Nenhum veículo encontrado" detail="Tente ajustar os filtros ou limpar a pesquisa." action={<><Button variant="dark" size="sm">Limpar filtros</Button><Button variant="quiet" size="sm">Ver todos</Button></>} />}
            head={[<Check aria-label="Selecionar todos" checked={allOn} indeterminate={!allOn && sel.size > 0} onChange={(v) => setSel(v ? new Set(list.map((a: any) => a.id)) : new Set())} />, 'Veículo', 'Placa', 'Status', 'Localização', 'Velocidade', 'Odômetro', '']}
            selected={(i) => sel.has(list[i]?.id)}
            rows={st === 'empty' ? [] : list.map((a: any) => { const v = s.vehicles[a.id], vs = vehicleStatus(v); return [<Check aria-label={`Selecionar ${a.name}`} checked={sel.has(a.id)} onChange={() => toggle(a.id)} />, <AssetSilhouette category={silhouetteOf(a)} className="w-12 h-[21px] text-ink-3" />, <Plate name={a.name} />, <StatusDot kind={statusKind(vs.key)} />, <span className="text-ink-2">Recife - PE</span>, vs.key === 'mov' ? <Num value={v.speed} unit="km/h" size="body" /> : <span className="text-ink-3">—</span>, <Num value={assetKm(s, a.id)} unit="km" size="body" />, menu(a)]; })} />}
      </Card>
      <Grid split="6/6">
        <Card title="Manutenção · progresso e prazo" icon="manutencao">
          <Table minWidth={560} loading={st === 'loading'} head={['Placa', 'Serviço', 'Progresso', 'Prazo']} rows={st === 'empty' ? [] : slice(5).map((a: any, i: number) => [<Plate name={a.name} />, ['Revisão 10.000 km', 'Troca de pneus', 'Correção de freios', 'Troca de óleo', 'Revisão 20.000 km'][i], <span className="flex items-center gap-2 min-w-[140px]"><Progress value={progress[i]} className="h-2 flex-1" label="Progresso" /><span className="text-small num w-9 text-right">{Math.round(progress[i] * 100)}%</span></span>, <Deadline kind={prazo[i][0]} label={prazo[i][1]} />])} />
        </Card>
        <Card title="Consumo · indicadores" icon="combustivel">
          <Table minWidth={480} loading={st === 'loading'} align={['left', 'right', 'right', 'right']} head={['Placa', 'Consumo (km/L)', 'Variação', 'Custo']} rows={st === 'empty' ? [] : slice(5).map((a: any, i: number) => [<Plate name={a.name} />, <Num value={[7.8, 9.1, 6.4, 8.0, 4.2][i]} digits={1} size="body" />, <DeltaChip value={[12.5, 8.3, -6.7, 2.1, -18.3][i]} unit="%" size="sm" />, <Num value={[1240.5, 980.3, 1560.2, 1120.4, 2340.9][i]} prefix="R$" digits={2} size="body" />])} />
        </Card>
      </Grid>
      <Card title="Usuários" icon="equipe">
        <Table minWidth={640} loading={st === 'loading'} head={['Usuário', 'Perfil', 'Unidade', 'Status', 'Último acesso', '']} rows={st === 'empty' ? [] : [['João Silva', 'Administrador', 'Recife - PE', 'green', 'Ativo', '28/10/2026 14:30'], ['Mariana Costa', 'Operacional', 'Jaboatão - PE', 'green', 'Ativo', '28/10/2026 14:12'], ['Rafael Ferreira', 'Manutenção', 'Recife - PE', 'orange', 'Pendente', '28/10/2026 12:01'], ['Thais Barbosa', 'Comercial', 'Recife - PE', 'gray', 'Inativo', '27/10/2026 18:20']].map(([n, p, u, t, l, d]) => [<span className="flex items-center gap-stack"><span className="w-8 h-8 rounded-pill bg-avatar text-ink text-caption font-semibold flex items-center justify-center">{n.split(' ').map((w) => w[0]).join('')}</span><span className="font-medium">{n}</span></span>, <span className="text-ink-2">{p}</span>, <span className="text-ink-2">{u}</span>, <Badge tone={t}>{l}</Badge>, <span className="num text-ink-2">{d}</span>, <Menu items={[{ label: 'Editar', icon: 'editar', onClick: () => {} }, { label: 'Desativar', icon: 'cadeado', danger: true, onClick: () => {} }]} />])} />
        <p className="text-caption text-ink-3 mt-3">Avatares neutros (iniciais sobre cinza): cor de avatar se confundiria com status.</p>
      </Card>
    </div>
  );
}

// ---------- mapa ----------
export function MapShowcase() {
  const s = useStore();
  const list = s.assets.filter((a: any) => s.vehicles[a.id]);
  const [sel, setSel] = useState<string | null>(list[0]?.id || null);
  const kinds: StatusKind[] = ['mov', 'parado', 'off', 'nosignal', 'crit'];
  const center: [number, number] = list[0] ? s.vehicles[list[0].id].pos : [-8.06, -34.9];
  const fences = [
    { id: 'z1', name: 'Matriz', type: 'Matriz', shape: 'polygon', points: [[center[0] + 0.02, center[1] - 0.03], [center[0] + 0.03, center[1] + 0.0], [center[0] + 0.01, center[1] + 0.02], [center[0] - 0.005, center[1] - 0.01]] },
    { id: 'z2', name: 'Área de risco', type: 'Área de risco', shape: 'polygon', points: [[center[0] - 0.02, center[1] - 0.05], [center[0] - 0.01, center[1] - 0.02], [center[0] - 0.035, center[1] - 0.015], [center[0] - 0.045, center[1] - 0.045]] },
    { id: 'z3', name: 'Cliente Atacadão', type: 'Cliente', shape: 'circle', center: [center[0] - 0.03, center[1] + 0.03], radius: 1500 },
    { id: 'z4', name: 'Posto BR', type: 'Posto', shape: 'circle', center: [center[0] + 0.035, center[1] + 0.04], radius: 1100 },
  ];
  const a = list.find((x: any) => x.id === sel);
  return (
    <div className="grid gap-grid lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="relative h-[460px] rounded-card overflow-hidden border border-line">
        <MapContainer center={center} zoom={11} className="absolute inset-0" zoomControl={false}>
          <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
          <FenceShapes fences={fences} />
          <ClusteredVehicles selected={sel} items={list.map((x: any) => { const v = s.vehicles[x.id]; const kd = statusKind(vehicleStatus(v).key); return { id: x.id, pos: v.pos, kind: kd, node: () => <GlideMarker position={v.pos} heading={v.heading} kind={kd} category={glyphOf(x)} plate={x.name} selected={sel === x.id} onClick={() => setSel(x.id)} /> }; })} />
        </MapContainer>
        <div className="absolute left-3 top-3 z-[500] flex flex-col gap-2"><IconButton aria-label="Buscar" tone="outline"><Icon name="busca" /></IconButton><IconButton aria-label="Camadas" tone="outline"><Icon name="camadas" /></IconButton><IconButton aria-label="Centralizar" tone="outline"><Icon name="centralizar" /></IconButton></div>
        {a && <div className="absolute right-3 bottom-3 z-[500]"><VehicleCard plate={a.name} silhouette={silhouetteOf(a)} photo={a.photo} model={[a.brand, a.model].filter(Boolean).join(' ')} kind={statusKind(vehicleStatus(s.vehicles[a.id]).key)} statusSub={`${num(s.vehicles[a.id].speed || 0)} km/h`} actions={[{ icon: 'monitoramento', label: 'Rastrear' }, { icon: 'historico', label: 'Histórico' }, { icon: 'mais-opcoes', label: 'Mais' }]} onClose={() => setSel(null)} /></div>}
      </div>
      <Card title="Marcadores e zonas" icon="monitoramento">
        <S>Disco na cor do status, glifo do tipo e seta de direção (em movimento e crítico)</S>
        <div className="flex flex-wrap gap-4 mb-5">
          {kinds.map((kd) => <span key={kd} className="flex flex-col items-center gap-tight"><span className="veh-marker" data-k={kd} style={{ position: 'static' }}><span className="disc"><svg className="veh-glyph" width="18" height="18" viewBox="0 0 24 24"><path d="M2.75 16.25V7.75h11v8.5 M13.75 10.25h4l3.5 3.5v2.5h-1.5 M2.75 16.25h1.5 M9.25 16.25h6 M6.75 18.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.75 18.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /></svg><span className="veh-arrow" style={{ transform: 'rotate(45deg)' }}><i /></span></span></span><StatusDot kind={kd} className="text-caption" /></span>)}
        </div>
        <S>Selecionado (halo na cor da revenda) e grupo (escuro, com número; ponto vermelho se houver crítico)</S>
        <div className="flex items-center gap-6 mb-5">
          <span className="veh-marker sel" data-k="mov"><span className="disc"><svg className="veh-glyph" width="18" height="18" viewBox="0 0 24 24"><path d="M5.75 16.25h-2.5v-3.5l2.25-.75 2.5-3.75h6.5l3.25 3.75 2.75.5v3.75h-2.25 M9.25 16.25h5.5 M8.25 12h9 M7.5 18a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z M16.5 18a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z" /></svg><span className="veh-arrow"><i /></span></span><span className="tag">KOZ5H91</span></span>
          <span className="relative w-10 h-10"><span className="veh-cluster" style={{ left: '50%', top: '50%' }}><span className="num">24</span></span></span>
          <span className="relative w-14 h-10"><span className="veh-cluster" style={{ left: '50%', top: '50%' }}><span className="dot" /><span className="num">42</span></span></span>
        </div>
        <S>Zonas de cerca (pelo tipo)</S>
        <ul className="grid grid-cols-2 gap-2 text-small">
          {[['Empresa', 'Matriz, filial, pátio'], ['Risco', 'Área de risco'], ['Clientes', 'Cliente, fornecedor'], ['Serviços', 'Oficina, posto, outro']].map(([l, d], i) => <li key={l} className="flex items-center gap-2"><span className="w-4 h-4 rounded-chip border-2 border-dashed shrink-0" style={{ borderColor: `var(--zone-${i + 1})`, background: `color-mix(in srgb, var(--zone-${i + 1}) 14%, transparent)` }} /><span><b className="font-medium">{l}</b> <span className="text-ink-2">{d}</span></span></li>)}
        </ul>
        <p className="text-caption text-ink-3 mt-4">Clique num veículo no mapa: o card mostra a silhueta. Zona da cerca {fenceZone('Cliente')} = clientes.</p>
      </Card>
    </div>
  );
}

// ---------- estados, ilustrações, avisos e diálogos ----------
export function StatesGallery() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-grid">
      <Grid cols={3}>
        <Card title="Vazio de página" icon="monitoramento"><EmptyState size="page" illustration="ilu-busca-veiculo" title="Nenhum veículo encontrado" detail="Tente ajustar os filtros ou limpar a pesquisa." action={<><Button variant="dark" size="sm">Limpar filtros</Button><Button variant="quiet" size="sm">Ver todos</Button></>} /></Card>
        <Card title="Erro de página" icon="alerta"><ErrorState size="page" illustration="ilu-erro" title="Não foi possível carregar os veículos" detail="Verifique sua conexão e tente novamente." onRetry={() => {}} onBack={() => {}} /></Card>
        <Card title="Tudo em dia" icon="escudo"><EmptyState illustration="ilu-tudo-em-dia" title="Nenhum alerta crítico agora" detail="Os veículos estão operando dentro das regras." /></Card>
      </Grid>
      <Grid split="6/6">
        <Card title="Painel largo e baixo (layout row)"><EmptyState illustration="ilu-cercas" layout="row" title="Nenhuma cerca cadastrada" detail="Desenhe a primeira área no mapa para receber alertas de entrada e saída." action={<Button size="sm"><Icon name="mais" size={16} />Nova cerca</Button>} /></Card>
        <Card title="Vazio e erro pequenos (sem 3D)">
          <div className="grid sm:grid-cols-2 gap-2"><EmptyState icon="filtro" title="Sem dados no período" detail="Troque o período para ver este gráfico." /><ErrorState title="Não foi possível calcular" detail="O servidor não respondeu a tempo para este gráfico." onRetry={() => {}} /></div>
        </Card>
      </Grid>
      <Grid cols={3}>
        <Card title="Carregando" icon="relogio"><div className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="w-10 h-5" /><Skeleton className="h-4 flex-1" /><Skeleton className="w-14 h-4" /></div>)}</div></Card>
        <Card title="Avisos (toast)" icon="mensagem">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => toast('Parâmetros salvos.')}>Sucesso</Button>
            <Button variant="secondary" size="sm" onClick={() => toast('Exportação em andamento.', { tone: 'info', detail: 'Você recebe o arquivo por e-mail.' })}>Informação</Button>
            <Button variant="secondary" size="sm" onClick={() => toast.error('O servidor não respondeu.', 'Não foi possível salvar')}>Erro</Button>
            <Button variant="secondary" size="sm" onClick={() => { const c = toast.command('Bloqueio · KOZ5H91'); setTimeout(() => c.waiting(), 700); setTimeout(() => c.confirmed(), 2200); }}>Comando</Button>
            <Button variant="secondary" size="sm" onClick={() => toast('Ordem de serviço excluída.', { action: { label: 'Desfazer', onClick: () => {} } })}>Com ação</Button>
          </div>
        </Card>
        <Card title="Diálogos" icon="documento">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Abrir modal</Button>
            <Button variant="danger" size="sm" onClick={() => confirmAction({ title: 'Excluir a ordem de serviço #1008?', detail: 'Os lançamentos ligados a ela continuam no histórico.' })}><Icon name="excluir" size={16} />Confirmar exclusão</Button>
          </div>
          <Modal open={open} onClose={() => setOpen(false)} title="Nova ordem de serviço" width="max-w-lg" footer={<><Button variant="quiet" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => setOpen(false)}>Salvar</Button></>}>
            <div className="grid gap-4"><Field label="Veículo"><Select value="KOZ5H91" options={['KOZ5H91', 'PEW1A33']} /></Field><Field label="Serviço" error="Campo obrigatório"><Input invalid placeholder="Ex.: troca de óleo" /></Field></div>
          </Modal>
        </Card>
      </Grid>
      <Card title={`Ilustrações (${ILLUSTRATION_IDS.length})`} icon="camera">
        <p className="text-small text-ink-2 mb-4">Normalizadas por scripts/ilustracoes.py: mesma altura útil (70%), objeto centralizado, fundo transparente. Em cima, 160×128 (página) sobre o card; embaixo, 96×77 (painel) sobre o fundo da página.</p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-5">
          {ILLUSTRATION_IDS.map((id) => <li key={id} className="flex flex-col items-center gap-tight"><Illustration id={id} /><span className="text-caption text-ink-3 font-mono">{id}</span></li>)}
        </ul>
        <ul className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-9 gap-3 mt-6 p-4 rounded-ctl bg-canvas">
          {ILLUSTRATION_IDS.map((id) => <li key={id} className="flex flex-col items-center gap-1"><Illustration id={id} size="panel" /><span className="text-[11px] text-ink-3 font-mono truncate max-w-full">{id.replace('ilu-', '')}</span></li>)}
        </ul>
      </Card>
    </div>
  );
}

// ---------- teste de fonte: Satoshi × Geist, lado a lado, mesmos tokens de tamanho ----------
// Satoshi é a fonte em uso (--font-sans); Geist só aparece aqui para comparação, carregada por index.html.
const FONT_SCALE: [string, string, string][] = [['display', 'Número principal', '48.320'], ['kpi', 'Número de KPI', '96,2%'], ['title', 'Título de página', 'Visão geral'], ['h2', 'Título de seção', 'Custos do mês'], ['h3', 'Título de card', 'Custo com combustível'], ['body', 'Texto corrido', 'No ritmo atual, o mês fecha em R$ 50.900, 3,4% acima da meta.'], ['small', 'Texto secundário', 'vs. mês anterior · atualização automática'], ['caption', 'Legenda', 'Atualizado em 31/10 às 14:32']];
const FONT_SCALE_CLASS: Record<string, string> = { display: 'text-display', kpi: 'text-kpi', title: 'text-title', h2: 'text-h2', h3: 'text-h3', body: 'text-body', small: 'text-small', caption: 'text-caption' };
function FontSample({ family, label }: { family: string; label: string }) {
  return (
    <div style={{ fontFamily: family }} className="flex flex-col gap-5 min-w-0">
      <p className="text-small font-semibold text-ink-2">{label}</p>
      <ul className="flex flex-col divide-y divide-line">
        {FONT_SCALE.map(([k, use, sample]) => (
          <li key={k} className="py-3 first:pt-0 flex flex-col gap-1">
            <span className={cx(FONT_SCALE_CLASS[k], ['display', 'kpi', 'title', 'h2', 'h3'].includes(k) && 'font-semibold', 'truncate')}>{sample}</span>
            <span className="text-caption text-ink-3"><span className="font-mono">text-{k}</span> · {use}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-8 gap-y-3 items-baseline pt-2 border-t border-line">
        <span className="num text-display font-semibold">48.320</span>
        <span className="num text-kpi font-semibold">96,2%</span>
        <span className="num text-kpi font-semibold">2,46</span>
      </div>
      <table className="w-full text-body">
        <thead><tr className="text-small text-ink-2 text-left"><th className="font-normal pb-1">Veículo</th><th className="font-normal pb-1 text-right">Custo</th><th className="font-normal pb-1 text-right">Odômetro</th></tr></thead>
        <tbody>
          {[['KOZ5H91', 48320.4, 182400], ['PEW1A33', 12580, 95200], ['TRK0012', 3680, 41900]].map(([plate, cost, km]) => (
            <tr key={plate as string} className="border-t border-line">
              <td className="py-2"><span className="font-mono text-small bg-plate text-plate-ink rounded-chip px-2 py-0.5">{plate}</span></td>
              <td className="py-2 text-right num">R$ {num(cost as number, 2)}</td>
              <td className="py-2 text-right num">{num(km as number)} km</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Card title="Disponibilidade da frota" icon="monitoramento" head="kpi">
        <div className="flex flex-col gap-kpi-title">
          <span className="num text-kpi font-semibold">96,2%</span>
          <span className="text-small text-ink-2">vs. 94,8% no período anterior</span>
        </div>
      </Card>
    </div>
  );
}
export function FontComparison() {
  return (
    <Card title="Satoshi × Geist" icon="design">
      <p className="text-small text-ink-2 -mt-1 mb-5">Mesmos tokens de tamanho (escala já ajustada para a Satoshi, ver nota em tokens.css). Algarismos tabulares nas duas. Placa e código continuam em Geist Mono nas duas colunas — isso não muda.</p>
      <div className="grid md:grid-cols-2 gap-8">
        <FontSample family="'Satoshi', ui-sans-serif, sans-serif" label="Satoshi (proposta)" />
        <FontSample family="'Geist', ui-sans-serif, sans-serif" label="Geist (atual)" />
      </div>
    </Card>
  );
}
