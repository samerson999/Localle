import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fileToDataURL } from '../lib/utils';
import { Icon } from './icons';
import { AssetSilhouette, silhouetteOf } from './assetArt';
import { pngIconUrl } from '../lib/pngIcons';
import { useCountUp } from '../lib/motion';
import { Heading, HeadingLevel, useHeadingLevel } from './primitives';
export * from './primitives';

export const cx = (...a: any[]) => a.filter(Boolean).join(' ');

// Mantém montado durante a animação de saída: closing = true por --t-exit depois que open vira false.
const EXIT_MS = 140;
export function usePresence(open: boolean, ms = EXIT_MS) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { mounted: open || mounted, closing: !open && mounted };
}

// Botões. primary = botão principal, na cor da revenda (--brand-fill; cai no grafite quando a marca não pode pintar).
// secondary (ghost, soft) = contorno neutro · quiet = cinza sem borda (Cancelar) · dark = grafite fixo
// danger = vermelho, só ação destrutiva · link = texto na cor do link da revenda.
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'dark' | 'danger' | 'link' | 'ghost' | 'soft' | 'success';
const BTN_V: Record<ButtonVariant, string> = {
  primary: 'bg-brand-fill text-brand-fill-ink hover:bg-brand-fill-hover active:bg-brand-fill-press',
  secondary: 'bg-card border border-line-strong text-ink hover:bg-card-2 hover:border-line-hover active:bg-surface-hover',
  quiet: 'bg-surface-muted text-ink hover:bg-surface-hover active:bg-surface-selected',
  dark: 'bg-graphite text-on-dark hover:bg-ink-hover active:bg-ink',
  danger: 'bg-crit text-on-dark hover:brightness-95 active:brightness-90',
  link: 'link-brand !px-0 !h-auto',
  ghost: '', soft: '', success: '',
};
BTN_V.ghost = BTN_V.soft = BTN_V.secondary; BTN_V.success = BTN_V.dark;
const BTN_S = { sm: 'h-ctl-sm px-3 text-small gap-icon', md: 'h-ctl px-4 text-body gap-icon', lg: 'h-ctl-lg px-5 text-body gap-icon' };
// aparência de botão para links e para o seletor de arquivo (FilePick), sem duplicar classes na tela
export const buttonClass = (variant: ButtonVariant = 'primary', size: 'sm' | 'md' | 'lg' = 'md') => cx('inline-flex items-center justify-center rounded-btn font-medium transition-colors duration-150 whitespace-nowrap', BTN_S[size], BTN_V[variant]);
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" className={cx('animate-spin shrink-0', className)}><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" /><path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}
export function Button({ variant = 'primary', size = 'md', loading = false, className = '', children, disabled, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button type="button" {...p} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx('inline-flex items-center justify-center rounded-btn font-medium transition-colors duration-150 whitespace-nowrap', loading ? 'cursor-progress' : 'disabled:opacity-45 disabled:cursor-not-allowed', BTN_S[size], BTN_V[variant], className)}>
      {loading && <Spinner />}{children}
    </button>
  );
}

// Ação em texto (Editar, Excluir, Remover): brand = ação comum (cor do link), danger = destrutiva.
export function TextButton({ tone = 'brand', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'brand' | 'danger' }) {
  return <button type="button" {...p} className={cx('text-small font-medium underline-offset-[3px] hover:underline disabled:opacity-40 disabled:no-underline', tone === 'danger' ? 'text-crit-ink' : 'link-brand', className)} />;
}

// Botão só com ícone: aria-label obrigatório. sidebar = hover sobre o canvas; on-dark = sobre superfície escura.
// outline = botão de mapa e barra de ferramentas (fundo de card com borda).
type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string; size?: 'sm' | 'md'; tone?: 'default' | 'sidebar' | 'on-dark' | 'outline' };
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({ size = 'md', tone = 'default', className = '', ...p }, r) => {
  const t = { default: 'text-ink-2 hover:text-ink hover:bg-card-2', sidebar: 'text-ink-2 hover:text-ink hover:bg-surface-hover', 'on-dark': 'text-on-dark hover:bg-on-dark-hover', outline: 'bg-card border border-line-strong text-ink hover:bg-card-2' }[tone];
  return <button ref={r} type="button" {...p} className={cx('inline-flex items-center justify-center shrink-0 transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed', size === 'sm' ? 'w-8 h-8 rounded-btn' : 'w-10 h-10 rounded-ctl', t, className)} />;
});

// Faixa de aviso dentro da página: warn = estado temporário/pendente, crit = erro.
export function Callout({ tone = 'warn', className = '', children }: { tone?: 'warn' | 'crit'; className?: string; children: React.ReactNode }) {
  return <p role={tone === 'crit' ? 'alert' : 'status'} className={cx('text-small font-medium rounded-ctl px-stack py-stack flex items-start gap-icon', tone === 'crit' ? 'bg-crit-soft text-crit-ink' : 'bg-warn-soft text-warn-ink', className)}><span className="ico-line"><Icon name={tone === 'crit' ? 'erro' : 'alerta'} size={16} /></span><span>{children}</span></p>;
}

// Bloco com borda dentro de um Card (subseção, item de lista editável). dense = 12 de padding; normal = card compacto (16).
// tone muted = fundo suave (bloco de pendências, resumo dentro de um painel)
export function Panel({ dense, tone, className = '', children, ...p }: { dense?: boolean; tone?: 'muted'; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx('border border-line rounded-ctl', tone === 'muted' && 'bg-card-2', dense ? 'p-stack' : 'p-card-sm bleed-card-sm', className)}>{children}</div>;
}

// Painel flutuante sobre o mapa ou sobre a tela (detalhe do veículo, "Passou por aqui"). side right = lateral, bottom = faixa
// inferior. Cabeçalho com título e fechar; corpo rola; rodapé com as ações. Entra deslizando e sai mais rápido.
export function FloatingPanel({ side = 'right', label, title, subtitle, header, onClose, footer, closing, children, className = '' }: {
  side?: 'right' | 'bottom'; label: string; title?: React.ReactNode; subtitle?: React.ReactNode; header?: React.ReactNode; onClose?: () => void;
  footer?: React.ReactNode; closing?: boolean; children?: React.ReactNode; className?: string;
}) {
  return (
    <aside aria-label={label} className={cx('absolute z-[450] bg-card rounded-panel shadow-panel flex flex-col overflow-hidden bleed-card-sm',
      side === 'right' ? 'right-3 top-3 bottom-3 w-[380px] max-w-[calc(100%-24px)]' : 'left-3 right-3 bottom-3 max-h-[60%]',
      closing ? (side === 'right' ? 'panel-out' : 'anim-out') : (side === 'right' ? 'panel-in' : 'anim-page'), className)}>
      {(title || header || onClose) && (
        <header className="flex items-start gap-stack px-card-sm pt-card-sm">
          <div className="min-w-0 mr-auto flex flex-col gap-hair">{header}{title && <h2 className="text-h3 font-semibold">{title}</h2>}{subtitle && <p className="text-small text-ink-2">{subtitle}</p>}</div>
          {onClose && <IconButton aria-label="Fechar" size="sm" className="-mr-1 -mt-1" onClick={onClose}><Icon name="fechar" size={18} /></IconButton>}
        </header>
      )}
      <div className="flex-1 overflow-y-auto px-card-sm pb-card-sm pt-card-head-sm"><HeadingLevel level={3}>{children}</HeadingLevel></div>
      {footer && <footer className="flex flex-wrap items-center gap-tight px-card-sm py-stack border-t border-line">{footer}</footer>}
    </aside>
  );
}

// Menu de contexto num ponto (clique direito no mapa): cabeçalho opcional (ex.: coordenadas) e itens como no Menu.
export function ContextMenu({ x, y, header, items, onClose }: { x: number; y: number; header?: React.ReactNode; items: { label: string; icon?: string; onClick?: () => void; to?: string }[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (box.current?.querySelector('a,button') as HTMLElement | null)?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  const cls = 'w-full flex items-center gap-icon px-stack h-9 rounded-btn text-body text-left text-ink hover:bg-surface-muted focus:bg-surface-muted';
  return (
    <div ref={box} role="menu" className="absolute z-[600] w-64 bg-card border border-line rounded-pop shadow-pop p-1 anim-page" style={{ left: x, top: y }}>
      {header && <div className="px-stack py-tight text-caption text-ink-3">{header}</div>}
      {items.map((it) => {
        const inner = <>{it.icon && <Icon name={it.icon} size={18} className="text-ink-2" />}{it.label}</>;
        return it.to ? <a key={it.label} role="menuitem" href={`#${it.to}`} className={cls} onClick={onClose}>{inner}</a>
          : <button key={it.label} type="button" role="menuitem" className={cls} onClick={() => { it.onClick?.(); onClose(); }}>{inner}</button>;
      })}
    </div>
  );
}

// Cartão de escolha (uma opção entre várias, com descrição): é controle de seleção, então o escolhido usa a cor da revenda.
export function ChoiceCard({ checked, onSelect, title, description, meta, tone }: { checked: boolean; onSelect: () => void; title: React.ReactNode; description?: React.ReactNode; meta?: React.ReactNode; tone?: 'danger' }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect}
      className={cx('text-left p-card-sm rounded-ctl border flex flex-col gap-hair transition-colors',
        checked ? 'border-brand-fill bg-brand-soft ring-1 ring-inset ring-brand-fill' : 'border-line-strong bg-card hover:bg-card-2 hover:border-line-hover')}>
      <span className={cx('text-body font-medium flex items-center gap-icon', tone === 'danger' && 'text-crit-ink')}>{title}</span>
      {description && <span className="text-small text-ink-2">{description}</span>}
      {meta && <span className="text-caption text-ink-3 font-mono">{meta}</span>}
    </button>
  );
}

// Lista com divisória entre itens. A altura de cada linha fica com quem usa (min-h-row / min-h-row-sm);
// listas clicáveis dentro de card usam -mx-bleed px-bleed para a linha encostar na borda e o texto alinhar com o título.
export function List({ className = '', children, ...p }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul {...p} className={cx('flex flex-col', className)}>{children}</ul>;
}
export function ListItem({ className = '', children, ...p }: React.LiHTMLAttributes<HTMLLIElement>) {
  return <li {...p} className={cx('border-t border-line first:border-t-0', className)}>{children}</li>;
}

// Pares rótulo/valor (detalhe de veículo, resposta de checklist). stacked = rótulo acima do valor.
export function DescList({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <dl className={cx('flex flex-col', className)}>{children}</dl>;
}
export function DescRow({ label, children, stacked, extra, className = '' }: { label: React.ReactNode; children: React.ReactNode; stacked?: boolean; extra?: React.ReactNode; className?: string }) {
  if (stacked) return <div className={cx('flex flex-col gap-hair py-tight border-t border-line first:border-t-0', className)}><dt className="text-small text-ink-2">{label}</dt><dd className="break-words">{children}</dd></div>;
  return (
    <div className={cx('flex items-center gap-stack min-h-row-sm py-tight border-t border-line first:border-t-0', className)}>
      <dt className="text-small text-ink-2 mr-auto shrink-0 max-w-[50%]">{label}</dt><dd className="text-body text-right num min-w-0 break-words">{children}</dd>{extra}
    </div>
  );
}

// Card: cabeçalho opcional (ícone de linha + título + ações + ↗ para abrir o detalhe) e rodapé opcional.
// O rodapé de leitura (frase + ›) é o <Insight>; card sem sombra e sem borda — se distingue só pelo contraste
// de fundo (--card sobre --canvas). variant="inset": para um Card aninhado dentro de outro Card/Panel, onde
// o fundo ao redor já é --card e o contraste sozinho não basta — mantém borda + --card-2 (sem sombra).
// Usos que precisam de variant="inset": nenhum identificado na auditoria de 2026-10-21 (não há Card dentro de
// Card hoje); fica disponível para quando surgir um caso assim — não aplicar "pra garantir" sem um caso real.
// Espaços: padding 24 (dense 16); cabeçalho → conteúdo 16 (dense 12; KPI 12, título → número); rodapé com divisor, 16 acima e abaixo.
// O título é h2 direto na página e h3 dentro de uma Section (nível pelo contexto, sem pular).
export function Card({ className = '', title, icon, actions, to, onOpen, footer, children, dense, head = 'default', subtitle, variant = 'default' }: { className?: string; title?: React.ReactNode; icon?: string; actions?: React.ReactNode; to?: string; onOpen?: () => void; footer?: React.ReactNode; children?: React.ReactNode; dense?: boolean; head?: 'default' | 'kpi'; subtitle?: React.ReactNode; variant?: 'default' | 'inset' }) {
  const level = useHeadingLevel();
  return (
    <section className={cx('rounded-card min-w-0 flex flex-col', variant === 'inset' ? 'bg-card-2 border border-line' : 'bg-card', dense ? 'p-card-sm bleed-card-sm' : 'p-card bleed-card', className)}>
      {(title || actions || to || onOpen) && <CardHeader title={title} subtitle={subtitle} icon={icon} actions={actions} to={to} onOpen={onOpen} className={head === 'kpi' ? 'mb-kpi-title' : dense ? 'mb-card-head-sm' : 'mb-card-head'} />}
      <div className="flex-1 min-w-0 min-h-0"><HeadingLevel level={level + 1}>{children}</HeadingLevel></div>
      {footer && <CardFooter>{footer}</CardFooter>}
    </section>
  );
}
// Cabeçalho de card: ícone de linha (12 até o título), título text-h3 em cinza médio (--ink-2, 6,9:1 sobre
// --canvas e --card — AA folgado), apoio opcional (text-small, 4 abaixo), ações e ↗.
// Cinza só aqui: título de PÁGINA (PageHeader) continua com a cor que já tinha, nunca este tom.
export function CardHeader({ title, subtitle, icon, actions, to, onOpen, className = '' }: { title?: React.ReactNode; subtitle?: React.ReactNode; icon?: string; actions?: React.ReactNode; to?: string; onOpen?: () => void; className?: string }) {
  const open = to || onOpen;
  const label = typeof title === 'string' ? `Abrir ${title.toLowerCase()}` : 'Abrir detalhe';
  return (
    <header className={cx('flex flex-wrap items-center gap-x-icon-head gap-y-tight', className)}>
      {icon && <Icon name={icon} size={22} className="text-ink-2 shrink-0" />}
      <div className="mr-auto min-w-0 flex flex-col gap-hair">
        {title && <Heading className="text-h3 font-semibold text-ink-2 min-w-0 break-words">{title}</Heading>}
        {subtitle && <p className="text-small text-ink-2">{subtitle}</p>}
      </div>
      {actions}
      {open && (to ? <a href={`#${to}`} aria-label={label} className="w-8 h-8 -mr-1 rounded-btn flex items-center justify-center text-ink-2 hover:text-ink hover:bg-card-2"><Icon name="externo" size={20} /></a>
        : <IconButton aria-label={label} size="sm" className="-mr-1" onClick={onOpen}><Icon name="externo" size={20} /></IconButton>)}
    </header>
  );
}
// Rodapé de card (leitura, dica, ações): divisor com 16 acima e 16 abaixo.
export function CardFooter({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx('mt-card-foot pt-card-foot border-t border-line', className)}>{children}</div>;
}

// Motivo da rota: ponto de partida, caminho tracejado e anel de chegada. Abre dicas, insights e progressões.
export function RouteMotif({ className = '', width = 36 }: { className?: string; width?: number }) {
  return (
    <svg aria-hidden="true" width={width} height={width * 0.45} viewBox="0 0 40 18" fill="none" className={cx('shrink-0', className)}>
      <circle cx="4" cy="13.5" r="3" fill="var(--real)" />
      <path d="M7.5 12.5C13 6.5 19 15 28 7" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2.2 3" />
      <circle cx="33.5" cy="5.5" r="3.75" stroke="var(--real)" strokeWidth="1.75" fill="var(--card)" />
    </svg>
  );
}
// Rodapé de leitura de um card: motivo da rota, a frase e, se houver destino, o ›.
export function Insight({ children, to, onClick }: { children: React.ReactNode; to?: string; onClick?: () => void }) {
  const inner = <><RouteMotif /><span className="text-small text-ink mr-auto min-w-0">{children}</span>{(to || onClick) && <Icon name="chevron" size={18} className="text-ink-2 shrink-0" />}</>;
  const cls = 'flex items-center gap-stack w-full text-left';
  if (to) return <a href={`#${to}`} className={cx(cls, 'group hover:[&>span]:underline underline-offset-2')}>{inner}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={cx(cls, 'hover:[&>span]:underline underline-offset-2')}>{inner}</button>;
  return <p className={cls}>{inner}</p>;
}
// Card de dica: o único lugar de conteúdo com a superfície na cor da revenda. No máximo um por tela.
export function TipCard({ title, children, action, onClose, className = '' }: { title?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; onClose?: () => void; className?: string }) {
  return (
    <aside className={cx('bg-brand-tip border border-brand-tip-line rounded-card p-card-sm flex items-start gap-stack', className)}>
      <span className="ico-line text-body"><RouteMotif /></span>
      <div className="flex-1 min-w-0 flex flex-col gap-hair">
        {title && <p className="text-body font-semibold">{title}</p>}
        <div className="text-small text-ink">{children}</div>
        {action && <div className="mt-tight">{action}</div>}
      </div>
      {onClose && <IconButton aria-label="Dispensar dica" size="sm" className="-m-1" onClick={onClose}><Icon name="fechar" size={16} /></IconButton>}
    </aside>
  );
}

// Campo de formulário: rótulo → campo 6, campo → ajuda/erro 6. Entre campos 16 (FormGroup), entre grupos 32 (Form),
// último campo → ações 24 (FormActions). error = mensagem em vermelho (o campo recebe invalid).
export function FormField({ label, hint, error, required, children, className = '' }: { label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-field-label text-small font-medium text-ink-2 min-w-0', className)}>
      <span>{label}{required && <span className="text-crit-ink" aria-hidden="true"> *</span>}</span>{children}
      {error ? <span role="alert" className="text-caption font-medium text-crit-ink flex items-start gap-icon"><span className="ico-line"><Icon name="erro" size={14} /></span>{error}</span>
        : hint && <span className="text-caption font-normal text-ink-2">{hint}</span>}
    </label>
  );
}
export const Field = FormField;
// Grupo de campos: título opcional (text-body semibold) e campos a 16 entre si; cols = colunas a partir de sm/md.
const FORM_COLS = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 md:grid-cols-3', 4: 'sm:grid-cols-2 md:grid-cols-4' } as const;
export function FormGroup({ title, description, cols = 1, className = '', children }: { title?: React.ReactNode; description?: React.ReactNode; cols?: 1 | 2 | 3 | 4; className?: string; children: React.ReactNode }) {
  return (
    <fieldset className={cx('flex flex-col gap-stack min-w-0', className)}>
      {(title || description) && <div className="flex flex-col gap-hair">{title && <legend className="contents"><span className="text-body font-semibold text-ink">{title}</span></legend>}{description && <p className="text-small text-ink-2">{description}</p>}</div>}
      <div className={cx('grid gap-field items-start', FORM_COLS[cols])}>{children}</div>
    </fieldset>
  );
}
// Formulário: grupos a 32 entre si; as ações ficam a 24 do último campo (prop actions, ou FormActions solto depois dos campos).
export function Form({ className = '', actions, children, ...p }: React.FormHTMLAttributes<HTMLFormElement> & { actions?: React.ReactNode }) {
  return <form {...p} className={cx('flex flex-col min-w-0', className)}><div className="flex flex-col gap-group min-w-0">{children}</div>{actions && <FormActions>{actions}</FormActions>}</form>;
}
export function FormActions({ className = '', align = 'end', children }: { className?: string; align?: 'start' | 'end' | 'between'; children: React.ReactNode }) {
  return <div className={cx('flex flex-wrap items-center gap-tight mt-form-actions', { start: '', end: 'justify-end', between: 'justify-between' }[align], className)}>{children}</div>;
}
const inputCls = 'h-ctl w-full border border-line-strong rounded-ctl px-3 text-body text-ink bg-card placeholder:text-ink-3 hover:border-line-hover focus:border-graphite transition-colors disabled:bg-surface-muted disabled:text-ink-3 disabled:border-line disabled:cursor-not-allowed aria-[invalid=true]:border-crit';
// type date/datetime-local/month/time usa os seletores próprios (DateInput, TimeInput) no lugar dos nativos.
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className = '', invalid, ...p }, r) => {
  if (p.type === 'date' || p.type === 'datetime-local' || p.type === 'month') return <DateInput {...(p as any)} className={className} />;
  if (p.type === 'time') { const { type, ...t } = p; return <TimeInput {...(t as any)} className={className} />; }
  return <input ref={r} {...p} aria-invalid={invalid || p['aria-invalid'] || undefined} className={cx(inputCls, className)} />;
});
// Busca com lupa e botão de limpar
export function SearchInput({ value, onChange, placeholder = 'Buscar', className = '', ...p }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; 'aria-label'?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Icon name="busca" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={p['aria-label'] || placeholder} className={cx(inputCls, 'pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden')} />
      {value && <button type="button" aria-label="Limpar busca" onClick={() => onChange('')} className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-btn flex items-center justify-center text-ink-3 hover:text-ink hover:bg-card-2"><Icon name="fechar" size={16} /></button>}
    </div>
  );
}
// Select próprio (a lista nativa do navegador não segue o padrão visual). Mesma API do <select>:
// onChange recebe { target: { value } }. A lista abre em portal para não ser cortada por modais.
type SelectOption = string | { value: string; label: string };
export function Select({ className = '', options, value, onChange, disabled, id, ...p }: { className?: string; options: SelectOption[]; value?: string | number; onChange?: (e: { target: { value: string } }) => void; disabled?: boolean; id?: string; 'aria-label'?: string }) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const sel = opts.findIndex((o) => o.value === String(value ?? ''));
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number }>({ left: 0, top: 0, width: 0 });
  const pres = usePresence(open);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const lid = useId();
  const show = () => {
    const r = btn.current!.getBoundingClientRect();
    const up = r.bottom + 296 > window.innerHeight && r.top > window.innerHeight - r.bottom;
    setPos(up ? { left: r.left, bottom: window.innerHeight - r.top + 4, width: r.width } : { left: r.left, top: r.bottom + 4, width: r.width });
    setAct(Math.max(0, sel)); setOpen(true);
  };
  const pick = (i: number) => { setOpen(false); btn.current?.focus(); if (opts[i] && i !== sel) onChange?.({ target: { value: opts[i].value } }); };
  useEffect(() => {
    if (!open) return;
    const out = (e: Event) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const scroll = (e: Event) => { if (!list.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', out); window.addEventListener('scroll', scroll, true); window.addEventListener('resize', scroll);
    return () => { document.removeEventListener('mousedown', out); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll); };
  }, [open]);
  useEffect(() => { if (open) list.current?.children[act]?.scrollIntoView({ block: 'nearest' }); }, [open, act]);
  const key = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(k)) { e.preventDefault(); show(); } return; }
    if (k === 'Escape' || k === 'Tab') { if (k === 'Escape') e.preventDefault(); setOpen(false); return; }
    if (k === 'ArrowDown') setAct((a) => Math.min(opts.length - 1, a + 1));
    else if (k === 'ArrowUp') setAct((a) => Math.max(0, a - 1));
    else if (k === 'Home') setAct(0);
    else if (k === 'End') setAct(opts.length - 1);
    else if (k === 'Enter' || k === ' ') pick(act);
    else if (k.length === 1) { const i = opts.findIndex((o, j) => j > act && o.label.toLowerCase().startsWith(k.toLowerCase())); const f = i >= 0 ? i : opts.findIndex((o) => o.label.toLowerCase().startsWith(k.toLowerCase())); if (f >= 0) setAct(f); else return; }
    else return;
    e.preventDefault();
  };
  return (
    <>
      <button ref={btn} id={id} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={lid} aria-activedescendant={open ? `${lid}-${act}` : undefined} aria-label={p['aria-label']}
        disabled={disabled} onClick={() => (open ? setOpen(false) : show())} onKeyDown={key}
        className={cx(inputCls, 'pl-3 pr-2 flex items-center gap-2 text-left', open && 'border-line-hover', className)}>
        <span className={cx('flex-1 truncate', sel < 0 && 'text-ink-3')}>{sel >= 0 ? opts[sel].label : 'Selecione'}</span>
        <Icon name="abaixo" size={16} className={cx('shrink-0 text-ink-3 transition-transform duration-[120ms]', open && 'rotate-180')} />
      </button>
      {pres.mounted && createPortal(
        <ul ref={list} id={lid} role="listbox" aria-label={p['aria-label']} onMouseDown={(e) => e.preventDefault()}
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width }}
          className={cx('fixed z-[1400] max-h-72 max-w-[min(420px,calc(100vw-16px))] overflow-y-auto bg-card border border-line rounded-pop shadow-pop p-1', pres.closing ? 'anim-out' : 'anim-page')}>
          {opts.map((o, i) => (
            <li key={o.value} id={`${lid}-${i}`} role="option" aria-selected={i === sel} onMouseEnter={() => setAct(i)} onClick={() => pick(i)}
              className={cx('flex items-center gap-icon px-stack py-tight rounded-btn text-body cursor-pointer', i === act && 'bg-surface-muted', i === sel && 'font-medium')}>
              <span className="flex-1">{o.label}</span>{i === sel && <Icon name="ok" size={16} className="shrink-0" />}
            </li>
          ))}
        </ul>, document.body)}
    </>
  );
}
export function Textarea({ className = '', ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx('w-full border border-line-strong rounded-ctl p-3 text-body text-ink bg-card placeholder:text-ink-3 hover:border-line-hover focus:border-graphite transition-colors disabled:bg-surface-muted disabled:text-ink-3', className)} />;
}
// Controles de seleção: marcados na cor da revenda (--brand-fill, com fallback grafite). Foco = anel duplo.
const peerFocus = 'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--focus-outer)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--focus-inner)]';
type CheckProps = { label?: React.ReactNode; description?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; indeterminate?: boolean; disabled?: boolean; className?: string; 'aria-label'?: string };
export function Check({ label, description, checked, onChange, indeterminate, disabled, className = '', ...p }: CheckProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  const on = checked || indeterminate;
  return (
    <label className={cx('inline-flex items-start gap-tight text-body', disabled ? 'cursor-not-allowed text-ink-3' : 'cursor-pointer', className)}>
      <span className="relative ico-line">
        <input ref={ref} type="checkbox" className="peer sr-only" checked={!!checked} disabled={disabled} aria-label={p['aria-label']} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden="true" className={cx('w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-colors duration-[120ms]', peerFocus,
          on ? 'bg-brand-fill border-brand-fill text-brand-fill-ink' : 'bg-card border-line-hover', !disabled && !on && 'hover:border-ink-3', disabled && 'opacity-45')}>
          {indeterminate ? <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            : checked ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
        </span>
      </span>
      {(label != null || description) && <span className="flex flex-col min-w-0">{label}{description && <span className="text-small text-ink-2">{description}</span>}</span>}
    </label>
  );
}
export function Radio({ label, description, checked, onChange, name, disabled, className = '' }: { label: React.ReactNode; description?: React.ReactNode; checked: boolean; onChange: () => void; name: string; disabled?: boolean; className?: string }) {
  return (
    <label className={cx('inline-flex items-start gap-tight text-body', disabled ? 'cursor-not-allowed text-ink-3' : 'cursor-pointer', className)}>
      <span className="relative ico-line">
        <input type="radio" name={name} className="peer sr-only" checked={!!checked} disabled={disabled} onChange={onChange} />
        <span aria-hidden="true" className={cx('w-[18px] h-[18px] rounded-pill border-[1.5px] flex items-center justify-center transition-colors duration-[120ms]', peerFocus,
          checked ? 'border-brand-fill' : 'border-line-hover bg-card', disabled && 'opacity-45')}>
          <span className={cx('w-2 h-2 rounded-pill bg-brand-fill transition-transform duration-[120ms]', checked ? 'scale-100' : 'scale-0')} />
        </span>
      </span>
      <span className="flex flex-col min-w-0">{label}{description && <span className="text-small text-ink-2">{description}</span>}</span>
    </label>
  );
}
// Liga/desliga com efeito imediato (módulos, preferências). Pode ficar dentro de um <label> que o rotule.
export function Switch({ checked, onChange, ...p }: { checked: boolean; onChange: (v: boolean) => void; 'aria-label'?: string; disabled?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" role="switch" {...p} className="peer sr-only" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" className={cx('w-10 h-6 rounded-pill bg-switch-off transition-colors duration-[120ms] peer-checked:bg-brand-fill peer-disabled:opacity-45 peer-disabled:cursor-not-allowed after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-pill after:bg-card after:shadow-seg after:transition-transform after:duration-[120ms] peer-checked:after:translate-x-4', peerFocus)} />
    </span>
  );
}
export function Slider({ className = '', ...p }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input type="range" {...p} className={cx('w-full accent-[var(--brand-fill)] cursor-pointer', className)} />;
}
// Campo editável sem moldura (célula de tabela, par chave/valor); a moldura aparece só no foco.
export const InlineInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className = '', ...p }, r) => <input ref={r} {...p} className={cx('bg-transparent outline-none min-w-0 rounded-tight focus-visible:ring-2 focus-visible:ring-[var(--focus-outer)]', className)} />);

// Badge: status como ponto + texto; sem tom (ou blue/navy) é etiqueta em texto simples. Nunca fundo colorido.
// gray = anel vazado (Desligado/Pendente/Cancelado): só para status, não para tags.
// O símbolo é o mesmo do StatusGlyph (story.tsx), pelas classes .st-* de styles/base.css.
const dots: Record<string, string> = { red: 'crit', orange: 'parado', green: 'mov', pink: 'loss', gray: 'off' };
export function Badge({ tone = 'tag', children, className = '' }: { tone?: string; children: React.ReactNode; className?: string }) {
  const k = dots[tone];
  return (
    <span className={cx('inline-flex items-center gap-tight text-small whitespace-nowrap', k ? 'text-ink' : 'text-ink-2', className)}>
      {k && <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className={cx('shrink-0', `st-${k}`)}>{k === 'off' ? <circle cx="5" cy="5" r="3.25" className="st-ring" /> : <circle cx="5" cy="5" r="4" className="st-dot" />}</svg>}{children}
    </span>
  );
}

// Controle segmentado discreto (substitui as abas cinzas)
// Indicador que desliza até a opção ativa (--t-pill). Na primeira medida aparece direto, sem deslizar do zero.
// Indicador deslizante por FLIP: a posição/tamanho final (left/top/width/height) nunca transiciona;
// só `transform` anima (translate + scale a partir do retângulo anterior), sem custo de layout.
function useSlider(value: string) {
  const box = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const prev = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const b = el.querySelector<HTMLElement>(`[data-k="${CSS.escape(value)}"]`);
      if (!b) return;
      const next = { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight };
      const from = prev.current;
      prev.current = next;
      setRect(next);
      const node = indicator.current;
      if (!node) return;
      if (from && (from.x !== next.x || from.y !== next.y || from.w !== next.w || from.h !== next.h)) {
        const sx = from.w / next.w, sy = from.h / next.h, dx = from.x - next.x, dy = from.y - next.y;
        node.style.transition = 'none';
        node.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
        node.getBoundingClientRect(); // força o navegador a aplicar o ponto de partida antes de animar
        requestAnimationFrame(() => {
          node.style.transition = 'transform var(--t-pill) var(--ease-out)';
          node.style.transform = 'translate(0, 0) scale(1, 1)';
        });
      } else {
        node.style.transition = 'none';
        node.style.transform = 'translate(0, 0) scale(1, 1)';
      }
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [value]);
  const style: React.CSSProperties | undefined = rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h, transformOrigin: 'top left' } : undefined;
  return { box, indicator, style };
}
const sliderText = 'transition-colors duration-[250ms]';

// Contador neutro (abas, filtros, listas). O do "Precisa de você" é o único vermelho (Layout).
export function CountBadge({ n, className = '' }: { n: number; className?: string }) {
  return <span className={cx('min-w-[20px] h-5 px-2 rounded-pill bg-[var(--counter-bg)] text-[var(--counter-ink)] text-caption font-semibold inline-flex items-center justify-center num', className)}>{n > 99 ? '99+' : n}</span>;
}
// Controle segmentado: opção ativa na cor da revenda (--brand-fill, com fallback grafite), indicador que desliza.
type TabItem = { key: string; label: string; count?: number };
export function Tabs({ tabs, value, onChange, size = 'md' }: { tabs: TabItem[]; value: string; onChange: (k: string) => void; size?: 'sm' | 'md' }) {
  const { box, indicator, style } = useSlider(value);
  return (
    <div ref={box} role="tablist" className="relative inline-flex flex-wrap w-fit max-w-full gap-1 p-1 bg-card rounded-ctl">
      {style && <span ref={indicator} aria-hidden="true" style={style} className="absolute rounded-tight bg-brand-fill" />}
      {tabs.map((t) => {
        const on = value === t.key;
        return <button key={t.key} data-k={t.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.key)}
          className={cx('relative px-3 rounded-tight font-medium inline-flex items-center gap-tight', size === 'sm' ? 'h-7 text-caption' : 'h-8 text-small', sliderText, on ? cx('text-brand-fill-ink', !style && 'bg-brand-fill') : 'text-ink-2 hover:text-ink')}>
          {t.label}{t.count != null && <span className={cx('num text-caption', on ? 'opacity-80' : 'text-ink-3')}>{t.count}</span>}
        </button>;
      })}
    </div>
  );
}
// Abas de página: sublinhado na cor da revenda na aba ativa.
export function PageTabs({ tabs, value, onChange }: { tabs: TabItem[]; value: string; onChange: (k: string) => void }) {
  return (
    <div role="tablist" className="flex gap-6 shadow-[inset_0_-1px_0_var(--line)] overflow-x-auto overflow-y-hidden">
      {tabs.map((t) => {
        const on = value === t.key;
        return <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.key)}
          className={cx('relative h-11 text-body inline-flex items-center gap-2 whitespace-nowrap transition-colors', on ? 'text-ink font-semibold' : 'text-ink-2 hover:text-ink')}>
          {t.label}{t.count != null && <CountBadge n={t.count} />}
          <span aria-hidden="true" className={cx('absolute left-0 right-0 bottom-0 h-[2px] rounded-pill transition-colors', on ? 'bg-brand-fill' : 'bg-transparent')} />
        </button>;
      })}
    </div>
  );
}
export function Pills({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  const { box, indicator, style } = useSlider(value);
  return (
    <div ref={box} className="relative flex flex-wrap gap-tight">
      {style && <span ref={indicator} aria-hidden="true" style={style} className="absolute rounded-pill bg-brand-fill" />}
      {options.map((o) => <button key={o.key} data-k={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} className={cx('relative h-8 px-3 rounded-pill text-small font-medium border', sliderText, value === o.key ? cx('text-brand-fill-ink border-transparent', !style && 'bg-brand-fill') : 'border-line-strong text-ink hover:bg-card-2')}>{o.label}</button>)}
    </div>
  );
}
// Paginação: página atual na cor da revenda. page começa em 0. compact = só vizinhas; total = "Mostrando 1–5 de 48".
export function Pagination({ page, pages, onChange, total, pageSize, compact = false, className = '' }: { page: number; pages: number; onChange: (p: number) => void; total?: number; pageSize?: number; compact?: boolean; className?: string }) {
  if (pages <= 1 && total == null) return null;
  const win = compact ? 1 : 2;
  const nums: (number | '…')[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= win) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  const n = (v: number) => v.toLocaleString('pt-BR');
  return (
    <nav aria-label="Paginação" className={cx('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {total != null && pageSize && <span className="text-small text-ink-2 num mr-auto">Mostrando {n(Math.min(total, page * pageSize + 1))}–{n(Math.min(total, (page + 1) * pageSize))} de {n(total)}</span>}
      <div className="flex items-center gap-1">
        <IconButton aria-label="Página anterior" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}><Icon name="voltar" size={18} /></IconButton>
        {nums.map((x, i) => x === '…' ? <span key={'e' + i} className="w-8 text-center text-ink-3">…</span>
          : <button key={x} type="button" aria-current={x === page ? 'page' : undefined} aria-label={`Página ${x + 1}`} onClick={() => onChange(x)}
            className={cx('min-w-8 h-8 px-2 rounded-pill text-small num transition-colors', x === page ? 'bg-brand-fill text-brand-fill-ink font-semibold' : 'text-ink hover:bg-surface-muted')}>{x + 1}</button>)}
        <IconButton aria-label="Próxima página" size="sm" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}><Icon name="chevron" size={18} /></IconButton>
      </div>
    </nav>
  );
}
// Filtros: botão de filtro (com contagem neutra) e chip do filtro aplicado (removível). Neutros: não são a marca.
export function FilterButton({ label, count, active, onClick, icon }: { label: string; count?: number; active?: boolean; onClick?: () => void; icon?: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cx('h-ctl-sm px-3 rounded-btn border text-small font-medium inline-flex items-center gap-icon transition-colors', active ? 'bg-surface-selected border-line-hover text-ink' : 'bg-card border-line-strong text-ink hover:bg-card-2')}>
      {icon && <Icon name={icon} size={16} className="text-ink-2" />}{label}{count ? <CountBadge n={count} /> : null}
    </button>
  );
}
export function FilterChip({ label, onRemove }: { label: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="h-7 pl-3 pr-1 rounded-pill bg-surface-selected border border-line text-small text-ink inline-flex items-center gap-1">
      {label}<button type="button" aria-label={`Remover filtro ${typeof label === 'string' ? label : ''}`} onClick={onRemove} className="w-5 h-5 rounded-pill flex items-center justify-center text-ink-2 hover:text-ink hover:bg-surface-hover"><Icon name="fechar" size={14} /></button>
    </span>
  );
}
// Conteúdo da aba: fade curto (--t-swap) a cada troca, sem deslocamento. Use com a mesma key da aba.
export function TabPanel({ id, className = '', children }: { id: string; className?: string; children: React.ReactNode }) {
  return <div key={id} role="tabpanel" className={cx('anim-swap', className)}>{children}</div>;
}

export function Modal({ open, onClose, title, children, width = 'max-w-2xl', footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: string; footer?: React.ReactNode }) {
  const { mounted, closing } = usePresence(open);
  // na saída, mostra o último conteúdo aberto (quem chamou costuma zerar os dados ao fechar)
  const last = useRef({ title, children, footer });
  if (open) last.current = { title, children, footer };
  // Esc fecha só o diálogo do topo; popovers internos (lista, calendário) tratam o Esc antes e marcam defaultPrevented
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape' || e.defaultPrevented) return; const all = document.querySelectorAll('[aria-modal="true"]'); if (all[all.length - 1] === box.current) { e.preventDefault(); closeRef.current(); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  if (!mounted) return null;
  const c = last.current;
  // portal no body: o modal não fica preso a painéis com transform/z-index de quem o abriu
  return createPortal(
    <div className={cx('fixed inset-0 z-[1300] bg-scrim flex items-start justify-center p-4 md:p-10 overflow-y-auto', closing ? 'anim-fade-out' : 'anim-fade')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={c.title} className={cx('w-full bg-card rounded-panel shadow-modal p-card bleed-card flex flex-col', closing ? 'anim-out' : 'anim-page', width)}>
        <div className="flex items-center gap-stack mb-card-head"><h2 className="text-h2 font-semibold mr-auto">{c.title}</h2><IconButton aria-label="Fechar" size="sm" className="-mr-1" onClick={onClose}><Icon name="fechar" /></IconButton></div>
        <HeadingLevel level={3}><div className="flex flex-col gap-field min-w-0">{c.children}</div></HeadingLevel>
        {c.footer && <div className="flex flex-wrap justify-end gap-tight mt-form-actions pt-card-foot border-t border-line">{c.footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// Cabeçalho de página: discreto (ícone + nome pequenos), o peso visual fica com o conteúdo abaixo.
// Em telas de BI, passe `period` (seletor com comparação); em telas ao vivo, não passe.
export function PageHeader({ icon, title, subtitle, children, period }: { icon?: Parameters<typeof Icon>[0]['name']; title: string; subtitle?: React.ReactNode; children?: React.ReactNode; period?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-tight min-h-ctl mb-page-head md:pr-[var(--top-reserve,0px)]">
      <div className="mr-auto min-w-0 flex items-center gap-tight text-ink-2">
        {icon && <Icon name={icon} size={15} className="shrink-0" />}
        <h1 className="text-small font-medium truncate">{title}</h1>
        {subtitle && <span className="text-small text-ink-3 truncate hidden md:inline">· {subtitle}</span>}
      </div>
      {(period || children) && <div className="flex flex-wrap items-center gap-tight">{period}{children}</div>}
    </header>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'red' | 'green' | 'orange' }) {
  // número sempre em --ink; o tom vira um ponto ao lado do rótulo (verde não marca status)
  const dot = tone === 'red' ? 'bg-crit' : tone === 'orange' ? 'bg-warn' : '';
  return (
    <div className="bg-card rounded-card p-card-sm flex flex-col min-w-0 [container-type:inline-size]">
      <span className="text-small text-ink-2 flex items-center gap-tight">{dot && <span aria-hidden="true" className={cx('w-2 h-2 rounded-pill shrink-0', dot)} />}{label}</span>
      <span className="mt-kpi-title text-kpi !text-[clamp(28px,11cqi,var(--fs-kpi))] font-semibold break-words num text-ink">{typeof value === 'number' || typeof value === 'string' ? <CountText value={value} /> : value}</span>
      {hint && <span className="mt-kpi-meta text-caption text-ink-2">{hint}</span>}
    </div>
  );
}

// Conta até o número na primeira carga (useCountUp), mantendo o formato pt-BR do texto: "R$ 1.234,56", "85%", "12,5 km/L".
const NUM_RE = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/;
function CountText({ value }: { value: number | string }) {
  const s = String(value);
  // horários, datas e frações ("14:30", "17/10", "3/5") não contam
  const m = typeof value === 'number' || /\d[:/]\d/.test(s) ? null : NUM_RE.exec(s);
  const n = typeof value === 'number' ? value : m ? parseFloat(m[0].replace(/\./g, '').replace(',', '.')) : null;
  const dec = typeof value === 'number' ? (String(value).split('.')[1]?.length ?? 0) : m?.[0].split(',')[1]?.length ?? 0;
  const v = useCountUp(n);
  if (n == null || v == null) return <>{s}</>;
  const txt = v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: typeof value === 'number' || m![0].includes('.') });
  return <>{m ? s.slice(0, m.index) + txt + s.slice(m.index + m[0].length) : txt}</>;
}

// Barra de progresso (0 a 1). A mudança de valor anima o recorte em --t-progress; a ponta fica arredondada.
export function Progress({ value, color = 'var(--real)', className = 'h-2', label }: { value: number; color?: string; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} className={cx('relative w-full rounded-pill bg-track overflow-hidden', className)}>
      <div className="progress-fill absolute inset-0 rounded-pill" style={{ background: color, clipPath: `inset(0 ${(1 - v) * 100}% 0 0 round 999px)` }} />
    </div>
  );
}

// célula: 12 entre colunas; a 1ª e a última recuam pelo padding do card que contém a tabela (--bleed), alinhando com o título
const CELL_X = 'px-cell first:pl-[max(var(--bleed),var(--cell-x))] last:pr-[max(var(--bleed),var(--cell-x))]';
// `card`: versão empilhada para telas estreitas (abaixo de md), no lugar da tabela larga.
// Acima de `pageSize` linhas, pagina e mostra o total. Coluna de cabeçalho vazia ('') = ações, alinhada à direita.
// align: alinhamento por coluna (números à direita). selected: linhas marcadas (fundo neutro; o checkbox fica com quem usa).
// loading: linhas de esqueleto. emptyState: estado vazio rico (ilustração), no lugar do texto `empty`.
export function Table({ head, rows, empty = 'Nada por aqui ainda.', emptyState, minWidth = 640, onRow, pageSize = 50, card, align, selected, loading, dense }: {
  head: React.ReactNode[]; rows: React.ReactNode[][]; empty?: string; emptyState?: React.ReactNode; minWidth?: number; onRow?: (i: number) => void; pageSize?: number;
  card?: (i: number) => React.ReactNode; align?: ('left' | 'right' | 'center')[]; selected?: (i: number) => boolean; loading?: boolean; dense?: boolean;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pg = Math.min(page, pages - 1);
  const from = pg * pageSize;
  const shown = rows.length > pageSize ? rows.slice(from, from + pageSize) : rows;
  const act = (j: number) => j === head.length - 1 && head[j] === '';
  const al = (j: number) => (act(j) || align?.[j] === 'right' ? 'text-right' : align?.[j] === 'center' ? 'text-center' : 'text-left');
  const emptyNode = emptyState || <p className="py-10 text-center text-body text-ink-2">{empty}</p>;
  return (
    <div aria-busy={loading || undefined}>
      {card && (
        <ul className="md:hidden flex flex-col -mx-bleed">
          {!loading && rows.length === 0 && <li>{emptyNode}</li>}
          {shown.map((_, i) => <li key={from + i} onClick={onRow && (() => onRow(from + i))} className={cx('border-t border-line py-stack px-[max(var(--bleed),var(--cell-x))] first:border-t-0', onRow && 'cursor-pointer active:bg-card-2', selected?.(from + i) && 'bg-surface-selected')}>{card(from + i)}</li>)}
        </ul>
      )}
      <div className={cx('overflow-x-auto -mx-bleed', card && 'hidden md:block')}>
        <table className="w-full border-collapse text-body" style={{ minWidth }}>
          <thead><tr className="text-ink-2 text-caption">{head.map((h, i) => <th key={i} className={cx(CELL_X, 'h-10 font-medium border-b border-line', al(i))}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? Array.from({ length: 5 }, (_, i) => <tr key={i} className="border-t border-line first:border-t-0">{head.map((_, j) => <td key={j} className={cx(CELL_X, 'h-row')}><Skeleton className={cx('h-4', j === 0 ? 'w-24' : 'w-full max-w-[120px]', act(j) && 'ml-auto w-6')} /></td>)}</tr>)
              : rows.length === 0 ? <tr><td colSpan={head.length}>{emptyNode}</td></tr>
              : shown.map((r, i) => {
                const on = selected?.(from + i);
                return <tr key={from + i} onClick={onRow && (() => onRow(from + i))} aria-selected={selected ? !!on : undefined}
                  className={cx('border-t border-line first:border-t-0 row-hover', on ? 'bg-surface-selected' : 'hover:bg-card-2', onRow && 'cursor-pointer')}>
                  {r.map((c, j) => <td key={j} className={cx(CELL_X, 'align-middle num', dense ? 'h-row-sm py-hair' : 'h-row py-tight', al(j), act(j) && '[&>div]:justify-end whitespace-nowrap')}>{c}</td>)}
                </tr>;
              })}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && <Pagination className="-mx-bleed border-t border-line pt-stack px-[max(var(--bleed),var(--cell-x))]" page={pg} pages={pages} onChange={setPage} total={rows.length} pageSize={pageSize} />}
    </div>
  );
}

// Menu de ações (o "…" da linha): abre em portal; itens com ícone; danger = ação destrutiva em vermelho, separada.
export type MenuItem = { label: string; icon?: string; onClick: () => void; danger?: boolean; disabled?: boolean };
export function Menu({ items, label = 'Mais opções', trigger }: { items: MenuItem[]; label?: string; trigger?: (p: { ref: React.Ref<HTMLButtonElement>; open: boolean; toggle: () => void }) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number }>({ right: 0, top: 0 });
  const pres = usePresence(open);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btn.current!.getBoundingClientRect();
    const up = r.bottom + 48 * items.length + 16 > window.innerHeight;
    setPos(up ? { right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 4 } : { right: window.innerWidth - r.right, top: r.bottom + 4 });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    (list.current?.querySelector('button:not(:disabled)') as HTMLElement | null)?.focus();
    const out = (e: Event) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', out); window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', out); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);
  const key = (e: React.KeyboardEvent) => {
    const all = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const regular = items.filter((x) => !x.danger), danger = items.filter((x) => x.danger);
  const row = (x: MenuItem) => (
    <button key={x.label} type="button" role="menuitem" disabled={x.disabled} onClick={(e) => { e.stopPropagation(); setOpen(false); x.onClick(); }}
      className={cx('w-full flex items-center gap-icon px-stack h-9 rounded-btn text-body text-left disabled:opacity-40', x.danger ? 'text-crit-ink hover:bg-crit-soft focus:bg-crit-soft' : 'text-ink hover:bg-surface-muted focus:bg-surface-muted')}>
      {x.icon && <Icon name={x.icon} size={18} className={x.danger ? '' : 'text-ink-2'} />}{x.label}
    </button>
  );
  return (
    <>
      {trigger ? trigger({ ref: btn, open, toggle }) : <IconButton ref={btn} aria-label={label} aria-haspopup="menu" aria-expanded={open} size="sm" onClick={(e) => { e.stopPropagation(); toggle(); }}><Icon name="mais-opcoes" size={20} /></IconButton>}
      {pres.mounted && createPortal(
        <div ref={list} role="menu" aria-label={label} onKeyDown={key} style={{ right: pos.right, top: pos.top, bottom: pos.bottom }}
          className={cx('fixed z-[1400] min-w-[200px] bg-card border border-line rounded-pop shadow-pop p-1', pres.closing ? 'anim-out' : 'anim-page')}>
          {regular.map(row)}
          {danger.length > 0 && regular.length > 0 && <div className="h-px bg-line my-1 mx-1" />}
          {danger.map(row)}
        </div>, document.body)}
    </>
  );
}

export function FilePick({ accept, onFile, children, multiple, className = '', maxMB = 4, raw = false }: { accept?: string; onFile: (data: string, file: File) => void; children: React.ReactNode; multiple?: boolean; className?: string; maxMB?: number; raw?: boolean }) {
  const r = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={r} type="file" accept={accept} multiple={multiple} className="hidden" onChange={async (e) => {
        const files = Array.from(e.target.files || []);
        for (const f of files) {
          if (f.size > maxMB * 1024 * 1024) { toast.error(`Na simulação os arquivos ficam no navegador; envie um arquivo de até ${maxMB} MB.`, `"${f.name}" passa de ${maxMB} MB`); continue; }
          onFile(raw ? '' : await fileToDataURL(f), f);
        }
        e.target.value = '';
      }} />
      <button type="button" className={className} onClick={() => r.current?.click()}>{children}</button>
    </>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-ink-2 text-body py-10 px-6 bg-card-2 rounded-card">{children}</div>;
}

// ---------- ilustrações 3D (só vazio, erro e onboarding de página ou painel principal) ----------
// Os arquivos ilu-<id>.png saem de scripts/ilustracoes.py (recorte e mesma altura útil a partir do NN-nome.png
// entregue; inventário em docs/INVENTARIO-ASSETS.md). Sem o arquivo, aparece um marcador do mesmo tamanho.
// Versões WebP no tamanho de uso (2x): page 320×256 para 160×128, panel 192×154 para 96×77, em images/ilustracoes/web.
// O PNG de 640×512 fica só como alternativa para navegador sem WebP (o <picture> não baixa os dois).
const ILU = import.meta.glob('../images/ilustracoes/ilu-*.png', { eager: true, import: 'default' }) as Record<string, string>;
const ILU_WEB = import.meta.glob('../images/ilustracoes/web/ilu-*.webp', { eager: true, import: 'default' }) as Record<string, string>;
export const ILLUSTRATION_IDS = Object.keys(ILU).map((p) => p.replace(/^.*\/(ilu-[^/]+)\.png$/, '$1')).sort();
const iluUrl = (id: string) => Object.entries(ILU).find(([p]) => p.endsWith(`/${id}.png`))?.[1];
const iluWeb = (id: string, size: 'page' | 'panel') => Object.entries(ILU_WEB).find(([p]) => p.endsWith(`/${id}-${size}.webp`))?.[1];
export function Illustration({ id, size = 'page', className = '' }: { id: string; size?: 'page' | 'panel'; className?: string }) {
  const dim = size === 'page' ? 'w-40 h-32' : 'w-24 h-[77px]';
  const url = iluUrl(id), web = iluWeb(id, size);
  const img = url && <img src={url} alt="" draggable={false} loading="lazy" decoding="async" width={size === 'page' ? 160 : 96} height={size === 'page' ? 128 : 77} className={cx(dim, 'object-contain shrink-0', className)} />;
  if (url && web) return <picture className="contents"><source type="image/webp" srcSet={web} />{img}</picture>;
  if (url) return img;
  return <span aria-hidden="true" className={cx(dim, 'shrink-0 rounded-card border border-dashed border-line-strong bg-card-2 flex flex-col items-center justify-center gap-1 text-ink-3', className)}><Icon name="camera" size={size === 'page' ? 22 : 18} /><span className="text-caption font-mono">{id}</span></span>;
}

// ---------- estados: carregando, vazio, erro ----------
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton', className)} />;
}
// Vazio. Com `illustration`, é vazio de página ou painel (3D); sem, é vazio pequeno com ícone de linha.
// layout row = ilustração à esquerda e texto à direita (painel largo e baixo, como nas referências).
export function EmptyState({ icon = 'ok', title, detail, action, illustration, size = 'panel', layout = 'stack' }: { icon?: string; title: string; detail?: React.ReactNode; action?: React.ReactNode; illustration?: string; size?: 'page' | 'panel'; layout?: 'stack' | 'row' }) {
  const text = <>
    <p className={cx('font-semibold', size === 'page' ? 'text-h3' : 'text-body')}>{title}</p>
    {detail && <p className="text-small text-ink-2 max-w-[42ch]">{detail}</p>}
    {action && <div className="mt-tight flex flex-wrap gap-tight justify-center sm:justify-start">{action}</div>}
  </>;
  if (illustration && layout === 'row') return (
    <div className="flex flex-col sm:flex-row items-center gap-6 py-6 px-4 text-center sm:text-left">
      <Illustration id={illustration} size={size} /><div className="flex flex-col gap-tight">{text}</div>
    </div>
  );
  return (
    <div className={cx('flex flex-col items-center text-center gap-tight px-6', size === 'page' ? 'py-12' : 'py-10')}>
      {illustration ? <Illustration id={illustration} size={size} className="mb-tight" /> : <Icon name={icon} size={24} className="text-ink-3" />}
      {text}
    </div>
  );
}
// Erro. Com `illustration` (ilu-erro), é erro de página ou painel; sem, ícone de linha em vermelho.
export function ErrorState({ title = 'Não foi possível carregar', detail, onRetry, onBack, illustration, size = 'panel', layout = 'stack' }: { title?: string; detail?: React.ReactNode; onRetry?: () => void; onBack?: () => void; illustration?: string; size?: 'page' | 'panel'; layout?: 'stack' | 'row' }) {
  const actions = (onRetry || onBack) && <>
    {onRetry && <Button variant={illustration ? 'dark' : 'secondary'} size="sm" onClick={onRetry}><Icon name="reiniciar" size={16} />Tentar de novo</Button>}
    {onBack && <Button variant="quiet" size="sm" onClick={onBack}>Voltar</Button>}
  </>;
  const text = <>
    <p className={cx('font-semibold', size === 'page' ? 'text-h3' : 'text-body')}>{title}</p>
    {detail && <p className="text-small text-ink-2 max-w-[46ch]">{detail}</p>}
    {actions && <div className="mt-tight flex flex-wrap gap-tight justify-center sm:justify-start">{actions}</div>}
  </>;
  if (illustration && layout === 'row') return (
    <div role="alert" className="flex flex-col sm:flex-row items-center gap-6 py-6 px-4 text-center sm:text-left">
      <Illustration id={illustration} size={size} /><div className="flex flex-col gap-tight">{text}</div>
    </div>
  );
  return (
    <div role="alert" className={cx('flex flex-col items-center text-center gap-tight px-6', size === 'page' ? 'py-12' : 'py-10')}>
      {illustration ? <Illustration id={illustration} size={size} className="mb-tight" /> : <Icon name="erro" size={24} className="text-crit" />}
      {text}
    </div>
  );
}

// Foto do ativo; sem foto, o ícone 3D escolhido no cadastro (src/images/png-tight); sem ícone, a silhueta
// cheia da categoria (carreta: pelo tipo de implemento). Não é o glifo do marcador no mapa (MAP_GLYPH).
export function AssetThumb({ asset, className = 'w-16 h-7' }: { asset: any; className?: string }) {
  if (asset?.photo) return <img src={asset.photo} alt={`Foto de ${asset.name}`} className={cx('rounded-tight object-cover shrink-0', className)} />;
  const icon = asset?.icon && pngIconUrl(asset.icon);
  if (icon) return <img src={icon} alt="" draggable={false} className={cx('object-contain shrink-0', className)} />;
  return <AssetSilhouette category={silhouetteOf(asset)} className={cx('text-ink-3 shrink-0', className)} />;
}

// ---------- datas ----------
// DateInput substitui os seletores nativos de date, datetime-local e month (o Input desvia esses types para cá).
// Mesma API do <input>: value em texto ISO ('2026-10-18', '2026-10-18T14:30', '2026-10'); onChange recebe { target: { value } }.
const MES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const z2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
const parseD = (s?: string) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +(m[3] || 1)) : null; };
const addD = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addM = (d: Date, n: number) => { const r = new Date(d.getFullYear(), d.getMonth() + n, 1); return new Date(r.getFullYear(), r.getMonth(), Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate())); };

type DateKind = 'date' | 'datetime-local' | 'month';
type DateInputProps = { type: DateKind; value?: string; defaultValue?: string; onChange?: (e: { target: { value: string } }) => void; min?: string; max?: string; disabled?: boolean; required?: boolean; id?: string; className?: string; placeholder?: string; 'aria-label'?: string };
export function DateInput({ type, value, defaultValue, onChange, min, max, disabled, required, id, className = '', placeholder, ...p }: DateInputProps) {
  const [own, setOwn] = useState(defaultValue || '');
  const v = String(value ?? own);
  const cur = parseD(v);
  const time = type === 'datetime-local' ? v.slice(11, 16) : '';
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(() => cur || new Date());
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0, top: 0 });
  const pres = usePresence(open);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const emit = (s: string) => { if (value === undefined) setOwn(s); onChange?.({ target: { value: s } }); };
  const cut = type === 'month' ? 7 : 10;
  const lo = min?.slice(0, cut), hi = max?.slice(0, cut);
  const ok = (s: string) => (!lo || s >= lo) && (!hi || s <= hi);
  const show = () => {
    const r = btn.current!.getBoundingClientRect(), h = type === 'datetime-local' ? 420 : 370;
    const up = r.bottom + h > window.innerHeight && r.top > window.innerHeight - r.bottom;
    const left = Math.min(r.left, window.innerWidth - 300);
    setPos(up ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 });
    setFocus(cur || new Date()); setOpen(true);
  };
  const close = () => { setOpen(false); btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const out = (e: Event) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const scroll = (e: Event) => { if (!pop.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', out); window.addEventListener('scroll', scroll, true); window.addEventListener('resize', scroll);
    return () => { document.removeEventListener('mousedown', out); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll); };
  }, [open]);
  const fkey = type === 'month' ? ymd(focus).slice(0, 7) : ymd(focus);
  useEffect(() => { if (open) (pop.current?.querySelector(`[data-d="${fkey}"]`) as HTMLElement | null)?.focus(); }, [open, fkey]);
  const pickDay = (d: Date) => { const s = ymd(d); if (!ok(s)) return; if (type === 'date') { emit(s); close(); } else { emit(`${s}T${time || '08:00'}`); setFocus(d); } };
  const pickMonth = (m: number) => { const s = `${focus.getFullYear()}-${z2(m + 1)}`; if (ok(s)) { emit(s); close(); } };
  const gridKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = type === 'month' ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 } : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) setFocus(type === 'month' ? addM(focus, step[e.key]) : addD(focus, step[e.key]));
    else if (e.key === 'PageUp' || e.key === 'PageDown') setFocus(addM(focus, (e.key === 'PageUp' ? -1 : 1) * (type === 'month' ? 12 : 1)));
    else if (e.key === 'Home' && type !== 'month') setFocus(addD(focus, -focus.getDay()));
    else if (e.key === 'End' && type !== 'month') setFocus(addD(focus, 6 - focus.getDay()));
    else return;
    e.preventDefault();
  };
  const label = !cur ? '' : type === 'month' ? `${MES_L[cur.getMonth()]} de ${cur.getFullYear()}` : `${cur.getDate()} ${MES_C[cur.getMonth()]} ${cur.getFullYear()}${time ? `, ${time}` : ''}`;
  const today = new Date();
  const nowStr = type === 'month' ? ymd(today).slice(0, 7) : type === 'date' ? ymd(today) : `${ymd(today)}T${z2(today.getHours())}:${z2(today.getMinutes())}`;
  const navBtn = 'w-8 h-8 rounded-btn flex items-center justify-center text-ink-2 hover:bg-card-2 hover:text-ink';
  const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const days = Array.from({ length: 42 }, (_, i) => addD(first, i - first.getDay()));
  const cell = (sel: boolean, now: boolean, out = false) => cx('rounded-btn text-body num disabled:opacity-30 disabled:cursor-not-allowed', sel ? 'bg-brand-fill text-brand-fill-ink' : 'hover:bg-surface-muted', out && !sel && 'text-ink-3', now && !sel && 'font-semibold underline underline-offset-4');
  return (
    <>
      {value === undefined && id && <input type="hidden" id={id} value={v} />}
      <button ref={btn} id={value === undefined ? undefined : id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={p['aria-label'] ? `${p['aria-label']}${label ? `: ${label}` : ''}` : undefined}
        disabled={disabled} onClick={() => (open ? setOpen(false) : show())} onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); show(); } }}
        className={cx(inputCls, 'pl-3 pr-3 flex items-center gap-2 text-left', open && 'border-line-hover', className)}>
        <span className={cx('flex-1 truncate num', !cur && 'text-ink-3')}>{label || placeholder || (type === 'month' ? 'Escolher mês' : 'Escolher data')}</span>
        <Icon name="calendario" size={16} className="shrink-0 text-ink-3" />
      </button>
      {pres.mounted && createPortal(
        <div ref={pop} role="dialog" aria-label={type === 'month' ? 'Escolher mês' : 'Escolher data'} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}
          style={{ left: Math.max(8, pos.left), top: pos.top, bottom: pos.bottom }}
          className={cx('fixed z-[1400] w-[292px] bg-card border border-line rounded-pop shadow-pop p-3', pres.closing ? 'anim-out' : 'anim-page')}>
          <div className="flex items-center gap-1 mb-2">
            <button type="button" aria-label={type === 'month' ? 'Ano anterior' : 'Mês anterior'} className={navBtn} onClick={() => setFocus(addM(focus, type === 'month' ? -12 : -1))}><Icon name="voltar" size={16} /></button>
            <span aria-live="polite" className="flex-1 text-center text-body font-semibold">{type === 'month' ? focus.getFullYear() : `${MES_L[focus.getMonth()]} ${focus.getFullYear()}`}</span>
            <button type="button" aria-label={type === 'month' ? 'Próximo ano' : 'Próximo mês'} className={navBtn} onClick={() => setFocus(addM(focus, type === 'month' ? 12 : 1))}><Icon name="chevron" size={16} /></button>
          </div>
          {type === 'month' ? (
            <div role="grid" onKeyDown={gridKey} className="grid grid-cols-3 gap-1">
              {MES_C.map((m, i) => {
                const s = `${focus.getFullYear()}-${z2(i + 1)}`;
                return <button key={m} type="button" data-d={s} tabIndex={s === fkey ? 0 : -1} disabled={!ok(s)} aria-pressed={v.slice(0, 7) === s} aria-label={`${MES_L[i]} de ${focus.getFullYear()}`} onClick={() => pickMonth(i)} className={cx('h-11', cell(v.slice(0, 7) === s, s === nowStr.slice(0, 7)))}>{m}</button>;
              })}
            </div>
          ) : (
            <div role="grid" onKeyDown={gridKey}>
              <div role="row" className="grid grid-cols-7 mb-1">{SEMANA.map((d, i) => <span key={i} role="columnheader" className="h-7 flex items-center justify-center text-caption text-ink-3">{d}</span>)}</div>
              <div className="grid grid-cols-7 gap-y-hair">
                {days.map((d) => {
                  const s = ymd(d);
                  return <button key={s} type="button" role="gridcell" data-d={s} tabIndex={s === fkey ? 0 : -1} disabled={!ok(s)} aria-selected={v.slice(0, 10) === s} aria-label={`${d.getDate()} de ${MES_L[d.getMonth()]} de ${d.getFullYear()}`} onClick={() => pickDay(d)} className={cx('h-9', cell(v.slice(0, 10) === s, s === ymd(today), d.getMonth() !== focus.getMonth()))}>{d.getDate()}</button>;
                })}
              </div>
            </div>
          )}
          {type === 'datetime-local' && (
            <label className="mt-3 pt-3 border-t border-line flex items-center gap-3 text-small text-ink-2">Horário
              <TimeInput className="w-24 !h-9" value={time} onChange={(e) => e.target.value && emit(`${ymd(cur || focus)}T${e.target.value}`)} />
            </label>
          )}
          <div className="mt-3 flex items-center gap-3">
            {ok(nowStr.slice(0, cut)) && <TextButton onClick={() => { emit(nowStr); close(); }}>{type === 'month' ? 'Este mês' : type === 'date' ? 'Hoje' : 'Agora'}</TextButton>}
            {!required && v && <TextButton tone="danger" onClick={() => { emit(''); close(); }}>Limpar</TextButton>}
            {type === 'datetime-local' && <Button size="sm" className="ml-auto" onClick={close}>Concluir</Button>}
          </div>
        </div>, document.body)}
    </>
  );
}

// Horário HH:MM digitado, sem o relógio nativo. Só emite quando o horário está completo e válido (ou vazio).
export function TimeInput({ value, onChange, className = '', ...p }: { value?: string; onChange?: (e: { target: { value: string } }) => void; className?: string; disabled?: boolean; id?: string; 'aria-label'?: string; placeholder?: string }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  const fmt = (s: string) => { const d = s.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d; };
  const valid = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  return <input {...p} inputMode="numeric" placeholder={p.placeholder || '00:00'} value={draft} aria-invalid={draft.length === 5 && !valid(draft) ? true : undefined}
    onChange={(e) => { const s = fmt(e.target.value); setDraft(s); if (valid(s) || !s) onChange?.({ target: { value: s } }); }}
    onBlur={() => { if (draft && !valid(draft)) setDraft(value || ''); }}
    className={cx(inputCls, 'num aria-[invalid=true]:border-crit', className)} />;
}

// ---------- toast ----------
// Retorno de ação que não precisa de lugar fixo na tela ("Matriz salva."). Monte <Toaster /> uma vez (App.tsx).
//   toast('Parâmetros salvos.')                 → some sozinho em 4 s
//   toast('Não foi possível salvar.', { tone: 'crit' })   → 8 s, anunciado como alerta
//   const c = toast.command('Bloqueio · ABC1D23'); c.waiting(); … c.confirmed() | c.failed('Sem resposta em 60 s')
type ToastTone = 'ok' | 'crit' | 'info';
type CmdStep = 'sent' | 'waiting' | 'ok' | 'fail';
type ToastItem = { id: number; text: React.ReactNode; detail?: React.ReactNode; tone: ToastTone; cmd?: CmdStep; ttl: number; leaving?: boolean; action?: { label: string; onClick: () => void } };
let toastItems: ToastItem[] = [];
const toastSubs = new Set<() => void>();
let toastSeq = 0;
const setToasts = (f: (xs: ToastItem[]) => ToastItem[]) => { toastItems = f(toastItems); toastSubs.forEach((s) => s()); };
const patchToast = (id: number, p: Partial<ToastItem>) => setToasts((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
function dismissToast(id: number) {
  patchToast(id, { leaving: true });
  setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), EXIT_MS);
}
const TTL: Record<ToastTone, number> = { ok: 4000, info: 4000, crit: 8000 };
function addToast(t: Omit<ToastItem, 'id'>) {
  const id = ++toastSeq;
  setToasts((xs) => [...xs.filter((x) => !x.leaving).slice(-3), { ...t, id }]);
  return id;
}
export function toast(text: React.ReactNode, opts: { tone?: ToastTone; detail?: React.ReactNode; duration?: number; action?: { label: string; onClick: () => void } } = {}) {
  const tone = opts.tone || 'ok';
  return addToast({ text, detail: opts.detail, tone, action: opts.action, ttl: opts.duration ?? (opts.action ? 7000 : TTL[tone]) });
}
// Falha de uma ação: aviso vermelho no lugar do alert() do navegador.
toast.error = (e: unknown, title = 'Não foi possível concluir') => addToast({ text: title, detail: e instanceof Error ? e.message : typeof e === 'string' ? e : undefined, tone: 'crit', ttl: TTL.crit });
// Comando para o rastreador: fica na tela enquanto não há resposta; só some depois de confirmado ou falho.
toast.command = (text: React.ReactNode) => {
  const id = addToast({ text, detail: 'Comando enviado', tone: 'info', cmd: 'sent', ttl: 0 });
  return {
    waiting: (detail: React.ReactNode = 'Aguardando o rastreador…') => patchToast(id, { cmd: 'waiting', detail }),
    confirmed: (detail: React.ReactNode = 'Confirmado pelo rastreador') => patchToast(id, { cmd: 'ok', tone: 'ok', detail, ttl: 5000 }),
    failed: (detail: React.ReactNode = 'O rastreador não confirmou') => patchToast(id, { cmd: 'fail', tone: 'crit', detail, ttl: 10000 }),
    dismiss: () => dismissToast(id),
  };
};
toast.dismiss = dismissToast;

function ToastView({ t }: { t: ToastItem }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!t.ttl || paused || t.leaving) return;
    const h = setTimeout(() => dismissToast(t.id), t.ttl);
    return () => clearTimeout(h);
  }, [t.ttl, t.id, paused, t.leaving]);
  const busy = t.cmd === 'sent' || t.cmd === 'waiting';
  const icon = busy ? 'reiniciar' : t.tone === 'crit' ? 'erro' : t.tone === 'info' ? 'info' : 'sucesso';
  return (
    <div role={t.tone === 'crit' ? 'alert' : 'status'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      className={cx('pointer-events-auto w-full sm:w-[380px] bg-graphite text-on-dark rounded-pop shadow-pop pl-4 pr-2 py-3 flex items-start gap-stack', t.leaving ? 'toast-out' : 'toast-in')}>
      <span className="ico-line text-body"><Icon name={icon} size={18} className={cx('transition-colors duration-[250ms]', busy ? 'text-on-dark-3 animate-spin' : t.tone === 'crit' ? 'text-[color-mix(in_srgb,var(--crit)_70%,white)]' : 'text-on-dark')} /></span>
      <div className="flex-1 min-w-0 flex flex-col gap-hair">
        <p className="text-body font-medium leading-snug">{t.text}</p>
        {t.detail && <p key={String(t.cmd)} className="text-caption text-on-dark-3 leading-snug anim-swap">{t.detail}</p>}
        {t.cmd && (
          <ol aria-hidden="true" className="flex gap-1 mt-hair">
            {(['sent', 'waiting', 'ok'] as const).map((s, i) => {
              const at = { sent: 0, waiting: 1, ok: 2, fail: 2 }[t.cmd!];
              return <li key={s} className={cx('h-1 flex-1 rounded-pill transition-colors duration-[250ms]', i <= at ? (t.cmd === 'fail' && i === 2 ? 'bg-crit' : 'bg-on-dark') : 'bg-on-dark-hover')} />;
            })}
          </ol>
        )}
      </div>
      {t.action && <button type="button" onClick={() => { t.action!.onClick(); dismissToast(t.id); }} className="shrink-0 h-8 -my-1 px-3 rounded-btn text-small font-medium text-on-dark hover:bg-on-dark-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-dark">{t.action.label}</button>}
      <IconButton aria-label="Fechar aviso" size="sm" tone="on-dark" className="-my-1" onClick={() => dismissToast(t.id)}><Icon name="fechar" size={16} /></IconButton>
    </div>
  );
}
// Confirmação de ação destrutiva ou de peso: `if (await confirmAction({...}))`. Substitui o confirm() do navegador.
type ConfirmOpts = { title: string; detail?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; tone?: 'danger' | 'primary' };
let confirmReq: (ConfirmOpts & { resolve: (v: boolean) => void }) | null = null;
const confirmSubs = new Set<() => void>();
export function confirmAction(o: ConfirmOpts): Promise<boolean> {
  confirmReq?.resolve(false);
  return new Promise((resolve) => { confirmReq = { ...o, resolve }; confirmSubs.forEach((f) => f()); });
}
function ConfirmHost() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); confirmSubs.add(f); return () => { confirmSubs.delete(f); }; }, []);
  const r = confirmReq;
  const done = (v: boolean) => { if (!confirmReq) return; confirmReq.resolve(v); confirmReq = null; force((n) => n + 1); };
  return (
    <Modal open={!!r} onClose={() => done(false)} title={r?.title || ''} width="max-w-md"
      footer={<><Button variant="ghost" onClick={() => done(false)}>{r?.cancelLabel || 'Cancelar'}</Button><Button autoFocus variant={r?.tone === 'primary' ? 'primary' : 'danger'} onClick={() => done(true)}>{r?.confirmLabel || 'Excluir'}</Button></>}>
      {r?.detail ? <p className="text-body text-ink-2">{r.detail}</p> : null}
    </Modal>
  );
}
export function Toaster() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); toastSubs.add(f); return () => { toastSubs.delete(f); }; }, []);
  return <>
    <ConfirmHost />
    {createPortal(
      <div aria-live="polite" className="fixed z-[1500] bottom-4 left-4 right-4 sm:left-auto flex flex-col items-end gap-2 pointer-events-none">
        {toastItems.map((t) => <ToastView key={t.id} t={t} />)}
      </div>,
      document.body,
    )}
  </>;
}
