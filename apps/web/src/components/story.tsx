// Componentes que contam a história de cada tela: número principal → por que está assim → onde agir.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Skeleton, EmptyState, ErrorState, cx, IconButton, List, ListItem, DescList, DescRow, Card, CardHeader, CardFooter, Insight, Illustration, useHeadingLevel, HeadingLevel } from './ui';
import { Icon } from './icons';
import { useCountUp } from '../lib/motion';
import { isPlate } from '@localle/shared/utils';

const fmt = (v: number, digits = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Número tabular, sempre na fonte da interface (nunca mono).
// size display/kpi/lg: inteiro grande; prefixo e unidade em --num-minor, mesma cor ("92,4%", "2,46 km/L").
// Com prefixo de moeda, os centavos também diminuem ("R$ 48.320,40"); nos demais, os decimais ficam do tamanho do inteiro.
// size body/small: tudo no mesmo tamanho, unidade em cinza ("78 km/h" numa célula de tabela).
// Sem size: comportamento antigo (unidade menor e cinza, ajustável por unitClass), até as telas migrarem na Fase C.
export type NumSize = 'display' | 'kpi' | 'lg' | 'body' | 'small';
// display e kpi encolhem com a largura do card (unidade cqi, container em KpiCard/KpiTile/KpiHero) até um piso,
// lg = número secundário (text-h2): nunca o protagonista do card, que é sempre kpi;
// para "R$ 1.234.567" não estourar um card estreito; fora de um container, cqi segue a viewport e fica no teto.
const NUM_SIZE: Record<NumSize, string> = { display: 'text-display !text-[clamp(36px,13cqi,var(--fs-display))] font-semibold', kpi: 'text-kpi !text-[clamp(28px,11cqi,var(--fs-kpi))] font-semibold', lg: 'text-h2 font-semibold', body: 'text-body', small: 'text-small' };
// a mesma escala para textos que fazem papel de número (ex.: "1ª vida" num KpiTile)
export const numSizeClass = (size: NumSize) => NUM_SIZE[size];
export function Num({ value, unit, prefix, digits = 0, size, className = '', unitClass = '', count = false }: { value: number | null | undefined; unit?: string; prefix?: string; digits?: number; size?: NumSize; className?: string; unitClass?: string; count?: boolean }) {
  const counted = useCountUp(count ? value : null);
  const v = count ? counted : value;
  if (v == null || !isFinite(v)) return <span className={cx('num', size && NUM_SIZE[size], className)}>—</span>;
  const glue = unit && unit !== '%' ? ' ' : '';
  if (!size) return <span className={cx('num whitespace-nowrap', className)}>{prefix && <span className={cx('text-ink-3 font-normal', unitClass || 'text-[0.5em] tracking-normal')}>{prefix} </span>}{fmt(v, digits)}{unit && <span className={cx('text-ink-3 font-normal', unitClass || 'text-[0.5em] tracking-normal')}>{glue}{unit}</span>}</span>;
  const big = size === 'display' || size === 'kpi' || size === 'lg';
  const [int, dec] = fmt(v, digits).split(',');
  const minor = 'text-[length:var(--num-minor)] tracking-normal';
  return (
    <span className={cx('num whitespace-nowrap', NUM_SIZE[size], className)}>
      {prefix && <span className={big ? cx(minor, 'mr-[0.15em]') : 'text-ink-2'}>{prefix}{big ? '' : ' '}</span>}
      {int}{dec != null && (big && prefix ? <span className={minor}>,{dec}</span> : `,${dec}`)}
      {unit && <span className={cx(big ? minor : 'text-ink-2', unitClass)}>{glue}{unit}</span>}
    </span>
  );
}

// Placa e códigos (IMEI, OS, frota, contrato): chip cinza em mono com zero cortado.
// Selecionada = aro escuro (a cor da revenda não marca seleção de conteúdo); desabilitada = apagada.
type IdChipProps = { children: React.ReactNode; size?: 'sm' | 'md' | 'lg'; state?: 'default' | 'selected' | 'disabled'; className?: string; title?: string };
const ID_SIZE = { sm: 'h-5 px-2 text-caption', md: 'h-6 px-2 text-small', lg: 'h-10 px-3 text-[22px] tracking-[0.03em]' };
export function IdChip({ children, size = 'md', state = 'default', className = '', title }: IdChipProps) {
  return (
    <span title={title} className={cx('inline-flex items-center rounded-chip font-mono font-semibold whitespace-nowrap tracking-[0.02em] align-middle', ID_SIZE[size],
      state === 'disabled' ? 'bg-plate-off text-ink-3' : state === 'selected' ? 'bg-card text-plate-ink ring-[1.5px] ring-inset ring-[var(--plate-sel-line)]' : 'bg-plate text-plate-ink', className)}>
      {children}
    </span>
  );
}
export const Plate = ({ name, ...p }: Omit<IdChipProps, 'children'> & { name: string }) => <IdChip {...p}>{name || '—'}</IdChip>;
// Nome de ativo: placa vira chip mono; nome livre ("Empilhadeira 02") fica em texto.
export const AssetName = ({ name, size = 'sm', className = '' }: { name?: string | null; size?: IdChipProps['size']; className?: string }) =>
  name && isPlate(name) ? <Plate name={name} size={size} className={className} /> : <span className={cx('font-medium', className)}>{name || '—'}</span>;

// Variação minimalista: só a seta e o número, sem chip de fundo. Verde = melhorou, vermelho = piorou,
// cinza = estável. good diz qual direção é boa ("down" para custo). Curto ("↓ 7,8 p.p.").
export function DeltaChip({ value, unit = 'p.p.', digits = 1, suffix, good = 'up', size = 'md' }: { value: number | null; unit?: string; digits?: number; suffix?: string; good?: 'up' | 'down'; size?: 'sm' | 'md' | 'lg' }) {
  if (value == null || !isFinite(value)) return null;
  const up = value > 0, flat = Math.abs(value) < Math.pow(10, -digits) / 2;
  const better = flat ? null : (up && good === 'up') || (!up && good === 'down');
  const tone = better == null ? 'text-ink-2' : better ? 'text-pos' : 'text-crit-ink';
  const sz = { sm: 'gap-1 text-caption', md: 'gap-1 text-small', lg: 'gap-1 text-body' }[size];
  const ar = size === 'lg' ? 14 : 12;
  return (
    <span className={cx('inline-flex items-center font-medium whitespace-nowrap num', sz, tone)}>
      {!flat && <svg aria-hidden="true" width={ar} height={ar} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{up ? <path d="M6 10.5v-9M2 5.5l4-4 4 4" /> : <path d="M6 1.5v9M2 6.5l4 4 4-4" />}</svg>}
      <span className="sr-only">{flat ? 'Estável' : `${up ? 'Alta' : 'Queda'} ${better ? '(melhor)' : '(pior)'} de`}</span>
      <span>{fmt(Math.abs(value), digits)}{unit === '%' ? '%' : unit ? ` ${unit}` : ''}</span>
      {suffix && <span className="font-normal opacity-80">{suffix}</span>}
    </span>
  );
}

// Status = ponto + texto. Nunca etiqueta com fundo.
// loss = perda já consumada (ex.: prazo perdido): rosa, nunca vermelho, e fora do "Precisa de você"
export type StatusKind = 'mov' | 'parado' | 'off' | 'nosignal' | 'crit' | 'loss';
export const statusKind = (key: string): StatusKind => (({ mov: 'mov', par: 'parado', des: 'off', sem: 'nosignal' } as Record<string, StatusKind>)[key] || 'off');
export const STATUS_LABEL: Record<StatusKind, string> ={ mov: 'Em movimento', parado: 'Parado ligado', off: 'Desligado', nosignal: 'Sem sinal', crit: 'Crítico', loss: 'Perda' };
// Só o símbolo (ponto, anel ou anel tracejado); as cores vêm dos tokens --status-* (styles/base.css)
export function StatusGlyph({ kind, className = '' }: { kind: StatusKind; className?: string }) {
  const ring = kind === 'off' || kind === 'nosignal';
  return (
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className={cx('shrink-0', `st-${kind}`, className)}>
      {ring ? <circle cx="5" cy="5" r="3.25" className={cx('st-ring', kind === 'nosignal' && 'dashed')} /> : <circle cx="5" cy="5" r="4" className="st-dot" />}
    </svg>
  );
}
export function StatusDot({ kind, label, className = '' }: { kind: StatusKind; label?: React.ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-tight text-small text-ink whitespace-nowrap', className)}><StatusGlyph kind={kind} />{label ?? STATUS_LABEL[kind]}</span>;
}
// Status em duas linhas: ponto, rótulo e uma linha de apoio ("78 km/h · há 2 min")
export function StatusLine({ kind, label, sub, className = '' }: { kind: StatusKind; label?: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <span className={cx('inline-grid grid-cols-[10px_auto] gap-x-tight items-center', className)}>
      <StatusGlyph kind={kind} /><span className="text-body font-medium text-ink whitespace-nowrap">{label ?? STATUS_LABEL[kind]}</span>
      {sub && <><span /><span className="text-small text-ink-2 whitespace-nowrap num">{sub}</span></>}
    </span>
  );
}

// Prazos e vencimentos: ok (em dia), soon (vence em breve), today (vence hoje), overdue (vencido, ainda dá para agir)
// e lost (perda consumada, ex.: prazo de indicação perdido: rosa, nunca vermelho).
export type DeadlineKind = 'ok' | 'soon' | 'today' | 'overdue' | 'lost';
const DL: Record<DeadlineKind, { glyph: StatusKind; text: string }> = {
  ok: { glyph: 'mov', text: 'text-ink' }, soon: { glyph: 'parado', text: 'text-warn-ink' }, today: { glyph: 'parado', text: 'text-warn-ink' },
  overdue: { glyph: 'crit', text: 'text-crit-ink' }, lost: { glyph: 'loss', text: 'text-loss-ink' },
};
const DAY_MS = 86400000;
export function deadlineKind(due: number, now = Date.now(), soonDays = 30): DeadlineKind {
  const d = Math.floor(due / DAY_MS) - Math.floor(now / DAY_MS);
  return d < 0 ? 'overdue' : d === 0 ? 'today' : d <= soonDays ? 'soon' : 'ok';
}
export function deadlineLabel(due: number, now = Date.now(), soonDays = 30) {
  const d = Math.floor(due / DAY_MS) - Math.floor(now / DAY_MS);
  return d < 0 ? 'Vencido' : d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : d <= soonDays ? `Em ${d} dias` : 'Em dia';
}
export function Deadline({ kind, label, date, className = '' }: { kind: DeadlineKind; label: React.ReactNode; date?: React.ReactNode; className?: string }) {
  return (
    <span className={cx('inline-grid grid-cols-[10px_auto] gap-x-tight items-center', className)}>
      <StatusGlyph kind={DL[kind].glyph} /><span className={cx('text-body font-medium whitespace-nowrap', DL[kind].text)}>{label}</span>
      {date && <><span /><span className="text-small text-ink-2 num whitespace-nowrap">{date}</span></>}
    </span>
  );
}
// Linha de prazo: ícone, o que vence e o detalhe, e o prazo à direita
export function DeadlineRow({ icon, title, sub, kind, label, date, to }: { icon: string; title: React.ReactNode; sub?: React.ReactNode; kind: DeadlineKind; label: React.ReactNode; date?: React.ReactNode; to?: string }) {
  const inner = <>
    <Icon name={icon} size={22} className="text-ink-2 shrink-0" />
    <span className="flex flex-col min-w-0 mr-auto"><span className="text-body font-medium truncate" title={typeof title === 'string' ? title : undefined}>{title}</span>{sub && <span className="text-small text-ink-2 truncate">{sub}</span>}</span>
    <Deadline kind={kind} label={label} date={date} />
    {to && <Icon name="chevron" size={16} className="text-ink-3 shrink-0" />}
  </>;
  const cls = 'flex items-center gap-stack min-h-row py-tight border-t border-line first:border-t-0';
  return to ? <Link to={to} className={cx(cls, 'row-hover hover:bg-card-2 -mx-bleed px-bleed')}>{inner}</Link> : <div className={cls}>{inner}</div>;
}
// prioridade de alerta na linguagem de status: alta = crítico, média = atenção, baixa = anel
export const priorityKind = (p: string): StatusKind => (p === 'alta' ? 'crit' : p === 'media' ? 'parado' : 'off');

// Botão de ação concreta ao fim de uma leitura ("Revisar 6 OS")
export type Action = { label: string; to?: string; onClick?: () => void };
export function ActionButton({ action, dark = false }: { action: Action; dark?: boolean }) {
  const cls = cx('inline-flex items-center gap-1 h-9 pl-3 pr-2 rounded-btn text-small font-medium transition-colors whitespace-nowrap', dark ? 'bg-on-dark text-ink hover:bg-on-dark-btn-hover' : 'bg-card border border-line-strong text-ink hover:bg-card-2');
  const inner = <>{action.label}<Icon name="chevron" size={16} /></>;
  return action.to ? <Link to={action.to} className={cls}>{inner}</Link> : <button type="button" onClick={action.onClick} className={cls}>{inner}</button>;
}

// Rodapé de gráfico: frase em linguagem humana e, quando houver, a ação. Vai dentro de um CardFooter (divisor, 16 acima e abaixo).
export function ChartFoot({ sentence, action }: { sentence: React.ReactNode; action?: Action }) {
  return (
    <div className="flex flex-wrap items-center gap-x-grid gap-y-stack">
      <p className="text-body font-medium leading-snug mr-auto max-w-[60ch]">{sentence}</p>
      {action && <ActionButton action={action} />}
    </div>
  );
}

export type LoadState = 'ready' | 'loading' | 'empty' | 'error';

// Card de gráfico: cabeçalho (ícone + título + ↗, período como apoio), conteúdo e os estados de carregamento, vazio e erro.
// Mesmos espaços do Card: cabeçalho → gráfico 16; rodapé com divisor, 16 acima e abaixo.
// Rodapé: `insight` (motivo da rota + frase + ›, como nas referências) ou `sentence` + `action` (leitura com botão).
export function ChartCard({ title, icon, to, period, children, sentence, action, insight, insightTo, state = 'ready', empty, onRetry, className = '', aside }: { title: string; icon?: string; to?: string; period?: string; children: React.ReactNode; sentence?: React.ReactNode; action?: Action; insight?: React.ReactNode; insightTo?: string; state?: LoadState; empty?: { title: string; detail?: string }; onRetry?: () => void; className?: string; aside?: React.ReactNode }) {
  const ready = state !== 'loading' && state !== 'error' && state !== 'empty';
  const foot = !ready ? undefined : insight ? <Insight to={insightTo}>{insight}</Insight> : sentence ? <ChartFoot sentence={sentence} action={action} /> : undefined;
  return (
    <Card className={className} title={title} subtitle={period} icon={icon} to={to} actions={aside} footer={foot}>
      <div aria-busy={state === 'loading'} className="h-full flex flex-col">
        {state === 'loading' ? <div className="flex flex-col gap-stack"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-40 w-full" /><Skeleton className="h-4 w-2/3" /></div>
          : state === 'error' ? <ErrorState detail="O servidor não respondeu a tempo. Os dados da tela não foram alterados." onRetry={onRetry} />
          : state === 'empty' ? <EmptyState icon="filtro" title={empty?.title || 'Sem dados no período'} detail={empty?.detail || 'Troque o período ou os filtros para ver este gráfico.'} />
          : children}
      </div>
    </Card>
  );
}

// Card de KPI (as seis variações das referências): cabeçalho com ícone e ↗; número em text-kpi com subtítulo;
// à direita, o chip de variação com a comparação ("vs. set") ou, na situação crítica, o status; abaixo, o gráfico
// (children) e, no rodapé, a leitura com o motivo da rota. A barra em destaque do gráfico é sempre azul de dado.
export function KpiCard({ icon, title, to, value, prefix, unit, digits = 0, sub, delta, compare, status, children, insight, insightTo, state = 'ready', onRetry, empty, className = '' }: {
  icon?: string; title: string; to?: string; value: number | null; prefix?: string; unit?: string; digits?: number; sub?: React.ReactNode;
  delta?: { value: number | null; unit?: string; digits?: number; good?: 'up' | 'down' }; compare?: string;
  status?: { kind: StatusKind; label?: string; detail?: string }; children?: React.ReactNode; insight?: React.ReactNode; insightTo?: string;
  state?: LoadState; onRetry?: () => void; empty?: { title: string; detail?: string }; className?: string;
}) {
  const ready = state === 'ready' && value != null;
  return (
    <Card icon={icon} title={title} to={to} head="kpi" className={className} footer={ready && insight ? <Insight to={insightTo}>{insight}</Insight> : undefined}>
      <div aria-busy={state === 'loading'}>
        {state === 'loading' ? <div className="flex flex-col gap-stack"><Skeleton className="h-10 w-40" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-28 w-full" /></div>
          : state === 'error' ? <ErrorState detail="O cálculo falhou ao buscar os lançamentos do período. Os dados já salvos não foram afetados." onRetry={onRetry} />
          : !ready ? <EmptyState icon="relogio" title={empty?.title || 'Ainda sem dados suficientes'} detail={empty?.detail || 'O indicador aparece quando houver pelo menos um dia de operação no período.'} />
          : <>
            <div className="flex items-start gap-grid [container-type:inline-size]">
              <div className="mr-auto min-w-0 flex flex-col gap-kpi-meta">
                <Num value={value} prefix={prefix} unit={unit} digits={digits} size="kpi" count />
                {sub && <p className="text-small text-ink-2">{sub}</p>}
              </div>
              {delta && <div className="flex flex-col items-end gap-hair shrink-0"><DeltaChip {...delta} size="lg" />{compare && <span className="text-caption text-ink-3">{compare}</span>}</div>}
              {status && <div className="flex flex-col items-end gap-hair shrink-0"><StatusDot kind={status.kind} label={status.label} className="text-body font-medium" />{status.detail && <span className="text-caption text-ink-3">{status.detail}</span>}</div>}
            </div>
            {children && <div className="mt-kpi-chart">{children}</div>}
          </>}
      </div>
    </Card>
  );
}

// Card de KPI principal
export interface KpiRow { label: string; value: React.ReactNode; delta?: { value: number | null; unit?: string; digits?: number; good?: 'up' | 'down' } }
export function KpiHero({ title, period, value, unit, digits = 1, delta, sentence, goal, scale = [0, 100], rows = [], state = 'ready', onRetry }: {
  title: string; period?: string; value: number | null; unit?: string; digits?: number;
  delta?: { value: number | null; unit?: string; suffix?: string; good?: 'up' | 'down' }; sentence?: React.ReactNode;
  goal?: { value: number; label: string }; scale?: [number, number]; rows?: KpiRow[]; state?: LoadState; onRetry?: () => void;
}) {
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - scale[0]) / (scale[1] - scale[0])) * 100))}%`;
  return (
    <section className="bg-card rounded-card p-card bleed-card flex flex-col min-w-0" aria-busy={state === 'loading'}>
      <CardHeader title={title} subtitle={period} className="mb-kpi-title" />
      {state === 'loading' ? <div className="flex flex-col gap-grid"><Skeleton className="h-16 w-48" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-2.5 w-full" /><Skeleton className="h-24 w-full" /></div>
        : state === 'error' ? <ErrorState detail="O cálculo falhou ao buscar os lançamentos do período. Os dados já salvos não foram afetados." onRetry={onRetry} />
        : state === 'empty' || value == null ? <EmptyState icon="relogio" title="Ainda sem dados suficientes" detail="O indicador aparece quando houver pelo menos um dia de operação no período." />
        : <>
          <div className="flex flex-wrap items-baseline gap-x-grid gap-y-tight [container-type:inline-size]">
            <Num value={value} unit={unit} digits={digits} count size="display" />
            {delta && <DeltaChip {...delta} />}
          </div>
          {sentence && <p className="text-body leading-snug text-ink-2 mt-kpi-meta max-w-[52ch]">{sentence}</p>}
          {goal && (
            <div className="mt-kpi-chart">
              <div className="relative h-2.5 rounded-pill bg-track">
                <div className="absolute inset-y-0 left-0 rounded-pill bg-real grow-x" style={{ width: pos(value) }} />
                <div className="absolute -top-1.5 -bottom-1.5 w-[2px] bg-ink rounded-pill" style={{ left: `calc(${pos(goal.value)} - 1px)` }} aria-hidden="true" />
              </div>
              <div className="relative h-5 mt-tight text-caption text-ink-2 num">
                <span className="absolute -translate-x-1/2 whitespace-nowrap font-medium text-ink" style={{ left: pos(goal.value) }}>{goal.label}</span>
              </div>
            </div>
          )}
          {rows.length > 0 && (
            <DescList className="mt-kpi-chart">
              {rows.map((r) => <DescRow key={r.label} label={r.label} extra={r.delta && <dd className="w-[84px] flex justify-end"><DeltaChip {...r.delta} /></dd>}><span className="font-medium">{r.value}</span></DescRow>)}
            </DescList>
          )}
        </>}
    </section>
  );
}

// Lista "Precisa de você": ícone linear sem fundo, título, contexto e chevron
export interface NeedRow { id: string; icon: string; title: string; context?: React.ReactNode; to?: string; onClick?: () => void; tone?: 'crit' | 'warn' }
export function NeedsList({ items, empty = 'Nada pendente. Tudo em dia por aqui.', onNavigate }: { items: NeedRow[]; empty?: string; onNavigate?: () => void }) {
  if (!items.length) return <EmptyState icon="ok" title={empty} />;
  return (
    <List className="-mx-bleed">
      {items.map((i) => {
        const inner = (
          <>
            <span className="ico-line text-body"><Icon name={i.icon} size={20} className={i.tone === 'crit' ? 'text-crit' : 'text-ink-2'} /></span>
            <span className="flex flex-col gap-hair min-w-0 mr-auto"><span className="text-body font-medium">{i.title}</span>{i.context && <span className="text-small text-ink-2">{i.context}</span>}</span>
            <span className="ico-line text-body"><Icon name="chevron" size={16} className="text-ink-3" /></span>
          </>
        );
        const cls = 'flex items-start gap-stack w-full min-h-row text-left px-[max(var(--bleed),var(--cell-x))] py-stack row-hover hover:bg-card-2';
        return <ListItem key={i.id}>{i.to ? <Link to={i.to} onClick={onNavigate} className={cls}>{inner}</Link> : <button type="button" onClick={() => { i.onClick?.(); onNavigate?.(); }} className={cls}>{inner}</button>}</ListItem>;
      })}
    </List>
  );
}

// Card "Padrão encontrado": superfície sólida escura, navegável, carrossel automático.
// O número é text-kpi (protagonista do card); text-display fica só com o KpiHero, um por tela.
export function PatternCard({ items }: { items: { label: string; value: string; unit?: string; cause: string; action: Action }[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => setI((x) => (x + 1) % items.length), 5000);
    return () => clearInterval(id);
  }, [items.length]);
  if (!items.length) return <section className="bg-ink text-on-dark rounded-card p-card flex flex-col gap-kpi-title"><p className="text-small text-on-dark-3">Padrão encontrado</p><p className="text-body">Nenhum padrão relevante nos dados até agora.</p></section>;
  const idx = Math.min(i, items.length - 1);
  const p = items[idx];
  return (
    <section className="relative bg-real text-on-dark rounded-card p-card flex flex-col min-w-0" aria-roledescription="carrossel" aria-label="Padrões encontrados">
      <header className="flex items-center gap-tight">
        <Icon name="rota" size={16} className="text-on-dark" />
        <h2 className="text-small text-on-dark">{p.label}</h2>
        <Icon name="externo" size={16} className="ml-auto text-on-dark" />
      </header>
      <div className="mt-kpi-title overflow-hidden [container-type:inline-size]">
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: `${items.length * 100}%`, transform: `translateX(-${(100 / items.length) * idx}%)` }}
        >
          {items.map((it, k) => (
            <div key={k} aria-hidden={k !== idx} className="flex items-end gap-stack min-w-0" style={{ width: `${100 / items.length}%` }}>
              <div className="flex flex-col gap-kpi-meta min-w-0 flex-1">
                <p className="text-kpi !text-[clamp(28px,11cqi,var(--fs-kpi))] font-semibold num break-words text-on-dark">{it.value}{it.unit && <span className="text-[length:var(--num-minor)] tracking-normal font-normal">{it.unit === '%' ? '%' : ` ${it.unit}`}</span>}</p>
                <p className="text-body leading-snug text-on-dark max-w-[40ch]">{it.cause}</p>
              </div>
              <Illustration id="ilu-manutencao" size="panel" className="hidden sm:block" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto pt-card flex items-center gap-grid">
        <ActionButton action={p.action} dark />
        {items.length > 1 && (
          <div className="flex items-center gap-tight ml-auto" role="tablist" aria-label="Padrões">
            {items.map((_, j) => (
              <button
                key={j}
                type="button"
                role="tab"
                aria-selected={j === idx}
                aria-label={`Padrão ${j + 1} de ${items.length}`}
                onClick={() => setI(j)}
                className={cx('rounded-pill transition-all overflow-hidden', j === idx ? 'w-5 h-1.5 bg-on-dark-3' : 'w-1.5 h-1.5 bg-on-dark-3 hover:bg-on-dark-2')}
              >
                {j === idx && <span key={idx} className="block h-full rounded-pill bg-on-dark origin-left" style={{ animation: 'grow-x 5000ms linear both' }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// Linha do tempo "O que aconteceu": azul = no plano, rosa = custou
export function Timeline({ items }: { items: { tone: 'plan' | 'cost'; ts: number; title: string; detail?: string }[] }) {
  return (
    <ol className="relative flex flex-col">
      {items.map((x, k) => (
        <li key={k} className="relative grid grid-cols-[16px_1fr] gap-x-stack pb-grid last:pb-0">
          {k < items.length - 1 && <span aria-hidden="true" className="absolute left-[7px] top-4 bottom-0 w-px bg-line-strong" />}
          <span aria-hidden="true" className={cx('relative mt-1 w-[10px] h-[10px] ml-[3px] rounded-pill', x.tone === 'cost' ? 'bg-loss' : 'bg-real')} />
          <div className="min-w-0 flex flex-col gap-hair">
            <div className="flex flex-wrap items-baseline gap-x-tight"><span className="text-body font-medium">{x.title}</span><time className="num text-caption text-ink-3">{new Date(x.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div>
            {x.detail && <p className="text-small text-ink-2">{x.detail}</p>}
            <span className="sr-only">{x.tone === 'cost' ? 'Custou' : 'No plano'}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Seletor de período com comparação ("1–27 set" + "vs 1–27 ago")
export function PeriodButton({ label, compare, children }: { label: string; compare?: string; children?: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup={children ? 'dialog' : undefined} onClick={() => children && setOpen(!open)} className="h-ctl pl-3 pr-2 rounded-btn bg-card border border-line-strong flex items-center gap-icon text-body hover:bg-card-2 hover:border-line-hover transition-colors">
        <Icon name="calendario" size={18} className="text-ink-2" />
        <span className="font-medium num">{label}</span>
        {compare && <span className="text-ink-2 num">vs {compare}</span>}
        <Icon name="abaixo" size={16} className="text-ink-3" />
      </button>
      {open && children && <div role="dialog" aria-label="Escolher período" className="absolute right-0 top-12 z-[600] bg-card border border-line rounded-pop p-4 shadow-pop anim-page min-w-[280px]">{children(() => setOpen(false))}</div>}
    </div>
  );
}

// Cartão compacto de KPI: rótulo, número (text-kpi, encolhe com o card) em --ink, chip de variação e uma linha de contexto.
// Rótulo → número 12; número → contexto 8. O número é o único protagonista do cartão.
// O status (quando houver) é um ponto ao lado do rótulo, nunca a cor do número.
export function KpiTile({ label, value, unit, digits = 0, delta, sub, status, display }: {
  label: string; value?: number | null; unit?: string; digits?: number; display?: React.ReactNode;
  delta?: { value: number | null; unit?: string; digits?: number; good?: 'up' | 'down' }; sub?: React.ReactNode; status?: StatusKind;
}) {
  return (
    <div className="bg-card rounded-card p-card-sm flex flex-col min-w-0 [container-type:inline-size]">
      <span className="text-small text-ink-2 flex items-start gap-tight">{status && <span className="ico-line"><StatusGlyph kind={status} /></span>}<span className="min-w-0">{label}</span></span>
      <div className="flex flex-wrap items-baseline gap-x-tight gap-y-hair min-w-0 mt-kpi-title">
        {display ?? <Num value={value} unit={unit} digits={digits} size="kpi" count />}
        {delta && <DeltaChip {...delta} />}
      </div>
      {sub && <span className="text-caption text-ink-2 mt-kpi-meta">{sub}</span>}
    </div>
  );
}