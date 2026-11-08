import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { fileToDataURL } from '../lib/fileData';
import { Icon } from './icons';
import { AssetSilhouette, silhouetteOf } from './assetArt';
import { pngIconUrl } from '../lib/pngIcons';
import { useCountUp } from '../lib/motion';
import { Heading, HeadingLevel, useHeadingLevel } from './primitives';
import { rectUi, viewportUi } from '../lib/uiZoom';
import { aplicarMascara, ATRIBUTOS_MASCARA, type Mascara, mascaraValida, MENSAGEM_INVALIDA } from '../lib/mascaras';
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

// Trava a rolagem da página enquanto um modal, gaveta ou painel sobreposto está aberto (no celular o fundo rolava junto).
// Contador: vários sobrepostos abertos ao mesmo tempo só destravam quando o último fecha.
let scrollLocks = 0;
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (scrollLocks++ === 0) document.documentElement.style.overflow = 'hidden';
    return () => { if (--scrollLocks === 0) document.documentElement.style.overflow = ''; };
  }, [active]);
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
      className={cx('inline-flex items-center justify-center rounded-btn font-medium transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 whitespace-nowrap', loading ? 'cursor-progress' : 'disabled:opacity-45 disabled:cursor-not-allowed', BTN_S[size], BTN_V[variant], className)}>
      {loading && <Spinner />}{children}
    </button>
  );
}

// Ação em texto (Editar, Excluir, Remover): brand = ação comum (cor do link), danger = destrutiva.
// ação destrutiva (Excluir, Desativar, Remover…) usa tone="danger": vermelho é só para crítico, erro e destrutivo
export function TextButton({ tone = 'brand', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'brand' | 'danger' }) {
  return <button type="button" {...p} className={cx('alvo-toque text-small font-medium underline-offset-[3px] hover:underline disabled:opacity-40 disabled:no-underline', tone === 'danger' ? 'text-crit-ink' : 'link-brand', className)} />;
}

// Botão só com ícone: aria-label obrigatório. sidebar = hover sobre o canvas; on-dark = sobre superfície escura.
// outline = botão de mapa e barra de ferramentas (fundo de card com borda).
type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string; size?: 'sm' | 'md' | 'touch'; tone?: 'default' | 'sidebar' | 'on-dark' | 'outline' | 'danger' | 'danger-outline' };
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({ size = 'md', tone = 'default', className = '', ...p }, r) => {
  const t = { default: 'text-ink-2 hover:text-ink hover:bg-card-2', sidebar: 'text-ink-2 hover:text-ink hover:bg-surface-hover', 'on-dark': 'text-on-dark hover:bg-on-dark-hover', outline: 'bg-card border border-line-strong text-ink hover:bg-card-2',
    // ação destrutiva (remover, excluir) é sempre vermelha — PRODUCT.md › cores; acoesDestrutivas.test.ts cobra o padrão
    danger: 'text-crit-ink hover:bg-crit-soft', 'danger-outline': 'bg-card border border-line-strong text-crit-ink hover:bg-crit-soft' }[tone];
  // touch = 44×44 (alvo de toque recomendado), só para a barra fixa do mobile; sm/md seguem os tokens de controle
  // (32/40 no desktop; com dedo, 40/44 — tokens.css › toque).
  const sizeCls = size === 'sm' ? 'w-ctl-sm h-ctl-sm rounded-btn' : size === 'touch' ? 'w-11 h-11 rounded-ctl' : 'w-ctl h-ctl rounded-ctl';
  return <button ref={r} type="button" {...p} className={cx('inline-flex items-center justify-center shrink-0 transition-[color,background-color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 disabled:opacity-30 disabled:cursor-not-allowed', sizeCls, t, className)} />;
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
  // celular: folha inferior presa à tela, com duas alturas (a faixa dentro do mapa deixava o corpo com poucos pixels)
  const mobile = useIsMobile();
  if (mobile) return <Sheet modal={false} label={label} title={title} subtitle={subtitle} header={header} onClose={onClose} actions={footer} closing={closing}>{children}</Sheet>;
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
      <div className="flex-1 overflow-y-auto overscroll-contain px-card-sm pb-card-sm pt-card-head-sm"><HeadingLevel level={3}>{children}</HeadingLevel></div>
      {footer && <footer className="flex flex-wrap items-center gap-tight px-card-sm py-stack border-t border-line">{footer}</footer>}
    </aside>
  );
}

// Aba da tela na URL (?aba=): recarregar, Voltar de outra tela e link direto (ex.: "Precisa de você") caem na mesma aba.
// Trocar de aba substitui a entrada do histórico em vez de empilhar — Voltar sai da tela, não percorre as abas.
export function useUrlTab(def: string): [string, (k: string) => void] {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('aba') || def;
  const set = (k: string) => setSp((cur) => { const n = new URLSearchParams(cur); if (k === def) n.delete('aba'); else n.set('aba', k); return n; }, { replace: true });
  return [tab, set];
}

// Item pedido pela URL (?os=, ?multa=, ?pneu=): abre quando o registro existir (os dados podem chegar depois da tela) e
// some da URL em seguida, para fechar o item não reabri-lo ao recarregar.
export function useUrlItem<T>(name: string, find: (id: string) => T | undefined, open: (item: T) => void, deps: unknown[]) {
  const [sp, setSp] = useSearchParams();
  const id = sp.get(name);
  useEffect(() => {
    if (!id) return;
    const item = find(id);
    if (item === undefined) return;
    open(item);
    setSp((cur) => { const n = new URLSearchParams(cur); n.delete(name); return n; }, { replace: true });
  }, [id, ...deps]);
}

// Campo próprio (sem <input> nativo) avisa que o usuário escolheu algo, para o Modal saber que há o que perder.
const EDIT_EVENT = 'localle-edit';
const signalEdit = (el?: Element | null) => el?.dispatchEvent(new Event(EDIT_EVENT, { bubbles: true }));

// Régua do celular: abaixo de md (768 px), a mesma do Tailwind e da barra lateral.
const MOBILE_MQ = '(max-width: 767px)';
export function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_MQ);
    const on = () => setM(mql.matches);
    on();
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, []);
  return m;
}

// Arrasto pela alça de uma folha inferior: o elemento segue o dedo (para cima, com resistência) e, ao soltar, volta ao
// lugar e quem chamou decide pelo deslocamento e pela velocidade (px/ms). Toque em botão, link ou campo não arrasta.
export function useSheetDrag(target: React.RefObject<HTMLElement>, onRelease: (dy: number, vy: number) => void) {
  const g = useRef<{ id: number; y: number; t: number; dy: number } | null>(null);
  const end = (e: React.PointerEvent) => {
    const s = g.current, el = target.current;
    if (!s || e.pointerId !== s.id) return;
    g.current = null;
    if (el) { el.style.transition = ''; el.style.translate = ''; }
    onRelease(s.dy, s.dy / Math.max(16, e.timeStamp - s.t));
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('a,input,select,textarea,button:not([data-sheet-handle])')) return;
      g.current = { id: e.pointerId, y: e.clientY, t: e.timeStamp, dy: 0 };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = g.current, el = target.current;
      if (!s || !el || e.pointerId !== s.id) return;
      s.dy = e.clientY - s.y;
      el.style.transition = 'none';
      el.style.translate = `0 ${s.dy < 0 ? s.dy * 0.2 : s.dy}px`;
    },
    onPointerUp: end, onPointerCancel: end,
  };
}

// Folha inferior do celular, o padrão único de sobreposição abaixo de md.
// modal = diálogo (fundo escurecido, foco preso, rolagem da página travada); a altura segue o conteúdo, até 92% da tela;
//   arrastar para baixo fecha.
// modal={false} = painel de detalhe sobre o mapa (veículo, "Passou por aqui"): o mapa continua usável acima; abre recolhida
//   (cabeçalho, ações e o começo do corpo) e expande até 88% da tela tocando ou arrastando a alça; arrastar para baixo
//   recolhe e, recolhida, fecha. As ações ficam logo abaixo do cabeçalho, ao alcance do polegar nas duas alturas.
// bare = o conteúdo traz o próprio cabeçalho, área rolável e rodapé (painel "Precisa de você"); a folha só põe a alça.
// tall = altura fixa de 92% (abas que trocam de conteúdo não fazem a folha pular de tamanho).
// Quem chama controla a montagem (usePresence) e passa `closing` durante a saída, como no FloatingPanel.
const SHEET_PEEK_BODY = 104; // quanto do corpo aparece com a folha recolhida
export function Sheet({ modal = true, bare = false, tall = false, label, title, subtitle, header, onClose, actions, footer, closing, children }: {
  modal?: boolean; bare?: boolean; tall?: boolean; label: string; title?: React.ReactNode; subtitle?: React.ReactNode; header?: React.ReactNode; onClose?: () => void;
  actions?: React.ReactNode; footer?: React.ReactNode; closing?: boolean; children?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null), top = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(modal);
  const [peek, setPeek] = useState(0);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useScrollLock(modal && !closing);
  useLayoutEffect(() => {
    if (modal) return;
    const measure = () => { const b = box.current, t = top.current; if (b && t) setPeek(Math.max(0, b.offsetHeight - Math.min(t.offsetHeight + SHEET_PEEK_BODY, b.offsetHeight * 0.6))); };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    if (top.current) ro.observe(top.current);
    return () => ro.disconnect();
  }, [modal]);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(box.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input,select,textarea,[tabindex]:not([tabindex="-1"])') || []);
    if (modal) focusables()[0]?.focus();
    const k = (e: KeyboardEvent) => {
      // Esc fecha só a sobreposição do topo (um Modal aberto por cima do painel do veículo, como Comandos, fecha primeiro)
      if (e.key === 'Escape' && !e.defaultPrevented) { const all = document.querySelectorAll('[aria-modal="true"],[data-sheet]'); if (all[all.length - 1] === box.current) { e.preventDefault(); closeRef.current?.(); } return; }
      if (!modal || e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); if (modal) back?.focus?.(); };
  }, [modal]);
  const drag = useSheetDrag(box, (dy, vy) => {
    const down = dy > 64 || vy > 0.5, up = dy < -40 || vy < -0.5;
    if (modal) { if (down) onClose?.(); return; }
    if (down) { if (expanded) setExpanded(false); else onClose?.(); }
    else if (up) setExpanded(true);
    else if (Math.abs(dy) < 6) setExpanded(!expanded);
  });
  const dragBody = !modal && !expanded;
  const sheet = (
    <div ref={box} data-sheet="" role={modal ? 'dialog' : 'region'} aria-modal={modal || undefined} aria-label={label}
      style={modal ? undefined : { transform: `translateY(${expanded ? 0 : peek}px)` }}
      className={cx('fixed inset-x-0 bottom-0 flex flex-col bg-card rounded-t-panel shadow-[var(--shadow-sheet)] bleed-card-sm no-print',
        'transition-[transform,translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        modal ? cx('z-[1310]', tall ? 'h-[92vh] supports-[height:100dvh]:h-[92dvh]' : 'max-h-[92vh] supports-[height:100dvh]:max-h-[92dvh]') : 'z-[1060] h-[88vh] supports-[height:100dvh]:h-[88dvh]', // acima da barra inferior (z-1050): o painel do veículo a cobre enquanto aberto
        closing ? 'sheet-out' : 'sheet-in')}>
      <div ref={top} {...drag} className="shrink-0 touch-none select-none">
        {modal
          ? <span aria-hidden="true" className="block mx-auto mt-2 mb-1 w-10 h-1 rounded-pill bg-line-strong" />
          : <button type="button" data-sheet-handle="" aria-label={expanded ? 'Recolher painel' : 'Expandir painel'} aria-expanded={expanded} onClick={(e) => { if (e.detail === 0) setExpanded(!expanded); /* teclado; o toque já alternou ao soltar */ }}
              className="flex w-full justify-center pt-2 pb-1"><span aria-hidden="true" className="w-10 h-1 rounded-pill bg-line-strong" /></button>}
        {!bare && (title || header || onClose) && (
          <header className="flex items-start gap-stack px-card-sm pt-tight">
            <div className="min-w-0 mr-auto flex flex-col gap-hair">{header}{title && <h2 className={cx(modal ? 'text-h2' : 'text-h3', 'font-semibold')}>{title}</h2>}{subtitle && <p className="text-small text-ink-2">{subtitle}</p>}</div>
            {onClose && <IconButton aria-label="Fechar" className="-mr-2 -mt-1" onClick={onClose}><Icon name="fechar" size={20} /></IconButton>}
          </header>
        )}
        {actions && <div className="flex items-center gap-tight px-card-sm pt-stack pb-tight">{actions}</div>}
      </div>
      {bare ? children : <>
      <div {...(dragBody ? drag : {})} onClick={dragBody ? () => setExpanded(true) : undefined}
        className={cx('flex-1 min-h-0 px-card-sm pt-card-head-sm', dragBody ? 'overflow-hidden touch-none' : 'overflow-y-auto overscroll-contain', !footer && 'pb-[max(var(--pad-card-sm),env(safe-area-inset-bottom))]')}>
        <HeadingLevel level={3}>{children}</HeadingLevel>
      </div>
      {footer && <footer className="shrink-0 flex flex-wrap items-center justify-end gap-tight px-card-sm pt-stack pb-[max(12px,env(safe-area-inset-bottom))] border-t border-line">{footer}</footer>}
      </>}
    </div>
  );
  return createPortal(modal
    ? <div className="fixed inset-0 z-[1300] no-print"><div className={cx('absolute inset-0 bg-scrim', closing ? 'anim-fade-out' : 'anim-fade')} onClick={onClose} />{sheet}</div>
    : sheet, document.body);
}

// Menu de contexto num ponto (clique direito no mapa): cabeçalho opcional (ex.: coordenadas) e itens como no Menu.
export function ContextMenu({ x, y, header, items, onClose }: { x: number; y: number; header?: React.ReactNode; items: { label: string; icon?: string; onClick?: () => void; to?: string; danger?: boolean }[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (box.current?.querySelector('a,button') as HTMLElement | null)?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  const base = 'w-full flex items-center gap-icon px-stack h-9 [@media(pointer:coarse)]:h-11 rounded-btn text-body text-left';
  // danger: ação destrutiva em vermelho, como no Menu
  const cls = (danger?: boolean) => cx(base, danger ? 'text-crit-ink hover:bg-crit-soft focus:bg-crit-soft' : 'text-ink hover:bg-surface-muted focus:bg-surface-muted');
  return (
    <div ref={box} role="menu" className="absolute z-[600] w-64 bg-card border border-line rounded-pop shadow-pop p-1 anim-page" style={{ left: x, top: y }}>
      {header && <div className="px-stack py-tight text-caption text-ink-3">{header}</div>}
      {items.map((it) => {
        const inner = <>{it.icon && <Icon name={it.icon} size={18} className={it.danger ? '' : 'text-ink-2'} />}{it.label}</>;
        return it.to ? <a key={it.label} role="menuitem" href={`#${it.to}`} className={cls(it.danger)} onClick={onClose}>{inner}</a>
          : <button key={it.label} type="button" role="menuitem" className={cls(it.danger)} onClick={() => { it.onClick?.(); onClose(); }}>{inner}</button>;
      })}
    </div>
  );
}

// Cartão de escolha (uma opção entre várias, com descrição): é controle de seleção, então o escolhido usa a cor da revenda.
export function ChoiceCard({ checked, onSelect, title, description, meta, tone, disabled }: { checked: boolean; onSelect: () => void; title: React.ReactNode; description?: React.ReactNode; meta?: React.ReactNode; tone?: 'danger'; disabled?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} disabled={disabled}
      className={cx('text-left p-card-sm rounded-ctl border flex flex-col gap-hair transition-colors disabled:opacity-50 disabled:pointer-events-none',
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
// `band`: rodapé "dica" (ex. TipBand) — variant="tip-frame" é o único que aceita; o card vira uma moldura na
// cor da revenda (4px, referência Visor) com uma caixa branca por dentro para o conteúdo e a faixa encostada
// na mesma moldura, sem caixa branca separando — por isso não combina com `footer` (que fica dentro da caixa
// branca normalmente, mas não faz sentido junto da faixa).
export function Card({ className = '', title, icon, actions, to, onOpen, footer, band, children, dense, head = 'default', subtitle, variant = 'default' }: { className?: string; title?: React.ReactNode; icon?: string; actions?: React.ReactNode; to?: string; onOpen?: () => void; footer?: React.ReactNode; band?: React.ReactNode; children?: React.ReactNode; dense?: boolean; head?: 'default' | 'kpi'; subtitle?: React.ReactNode; variant?: 'default' | 'inset' | 'tip-frame' }) {
  const level = useHeadingLevel();
  const padCls = dense ? 'p-card-sm bleed-card-sm' : 'p-card bleed-card';
  const inner = (
    <>
      {(title || actions || to || onOpen) && <CardHeader title={title} subtitle={subtitle} icon={icon} actions={actions} to={to} onOpen={onOpen} className={head === 'kpi' ? 'mb-kpi-title' : dense ? 'mb-card-head-sm' : 'mb-card-head'} />}
      <div className="flex-1 min-w-0 min-h-0"><HeadingLevel level={level + 1}>{children}</HeadingLevel></div>
      {footer && <CardFooter>{footer}</CardFooter>}
    </>
  );
  if (variant === 'tip-frame') {
    return (
      <section className={cx('rounded-card min-w-0 flex flex-col gap-hair bg-brand-tip-band p-hair shadow-card', className)}>
        <div className={cx('rounded-card bg-card min-w-0 flex flex-col', padCls)}>{inner}</div>
        {band}
      </section>
    );
  }
  return (
    <section className={cx('rounded-card min-w-0 flex flex-col', variant === 'inset' ? 'bg-card-2 border border-line' : 'bg-card shadow-card', padCls, className)}>
      {inner}
      {band && <div className={cx('-mx-bleed rounded-b-card overflow-hidden', dense ? '-mb-card-sm mt-card-foot' : '-mb-card mt-card-foot')}>{band}</div>}
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
      {open && (to ? <a href={`#${to}`} aria-label={label} className="w-ctl-sm h-ctl-sm -mr-1 rounded-btn flex items-center justify-center text-ink-2 hover:text-ink hover:bg-card-2"><Icon name="externo" size={20} /></a>
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
const inputCls = 'h-ctl w-full border border-line-strong rounded-ctl px-3 text-body text-ink bg-card placeholder:text-ink-3 hover:border-line-hover focus:outline-none transition-colors disabled:bg-surface-muted disabled:text-ink-3 disabled:border-line disabled:cursor-not-allowed aria-[invalid=true]:border-crit';
// type date/datetime-local/month/time usa os seletores próprios (DateInput, TimeInput) no lugar dos nativos.
// mask: restringe e formata enquanto digita (lib/mascaras) e, depois de sair do campo, marca inválido com a mensagem
// logo abaixo. type="number": mínimo 0 quando não informado (passe min negativo onde negativo faz sentido), sem
// notação científica (e, +), sem sinal de menos quando o mínimo é ≥ 0 e sem a roda do mouse mudar o valor.
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mask?: Mascara; maxDigits?: number };
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = '', invalid, mask, maxDigits, ...p }, r) => {
  const [saiu, setSaiu] = useState(false);
  if (p.type === 'date' || p.type === 'datetime-local' || p.type === 'month') return <DateInput {...(p as any)} className={className} />;
  if (p.type === 'time') { const { type, ...t } = p; return <TimeInput {...(t as any)} className={className} />; }
  if (mask) {
    const { onChange, onBlur, ...resto } = p;
    const errado = saiu && !mascaraValida(mask, String(p.value ?? ''), maxDigits);
    const attrs = { ...ATRIBUTOS_MASCARA[mask], ...(maxDigits ? { maxLength: maxDigits } : {}) };
    return (
      <>
        <input ref={r} {...attrs} {...resto} spellCheck={false} aria-invalid={invalid || errado || p['aria-invalid'] || undefined} className={cx(inputCls, className)}
          onChange={(e) => { e.target.value = aplicarMascara(mask, e.target.value, maxDigits); setSaiu(false); onChange?.(e); }}
          onBlur={(e) => { setSaiu(true); onBlur?.(e); }} />
        {errado && <span role="alert" className="text-caption font-medium text-crit-ink flex items-start gap-icon"><span className="ico-line"><Icon name="erro" size={14} /></span>{MENSAGEM_INVALIDA[mask]}</span>}
      </>
    );
  }
  if (p.type === 'number') {
    const { onChange, onKeyDown, ...resto } = p;
    const min = p.min ?? 0;
    const semNegativo = +min >= 0;
    return <input ref={r} inputMode={p.step === 'any' || String(p.step ?? '').includes('.') ? 'decimal' : 'numeric'} {...resto} min={min} aria-invalid={invalid || p['aria-invalid'] || undefined} className={cx(inputCls, className)}
      onKeyDown={(e) => { if (e.key === 'e' || e.key === 'E' || e.key === '+' || (semNegativo && e.key === '-')) e.preventDefault(); onKeyDown?.(e); }}
      onWheel={(e) => { if (document.activeElement === e.currentTarget) e.currentTarget.blur(); }}
      onChange={(e) => { if (semNegativo && e.target.value.startsWith('-')) e.target.value = e.target.value.slice(1); onChange?.(e); }} />;
  }
  return <input ref={r} {...p} aria-invalid={invalid || p['aria-invalid'] || undefined} className={cx(inputCls, className)} />;
});
// Busca com lupa e botão de limpar
export function SearchInput({ value, onChange, placeholder = 'Buscar', className = '', ...p }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; 'aria-label'?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Icon name="busca" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={p['aria-label'] || placeholder} className={cx(inputCls, 'pl-10 pr-10 [@media(pointer:coarse)]:pr-11 [&::-webkit-search-cancel-button]:hidden')} />
      {value && <button type="button" aria-label="Limpar busca" onClick={() => onChange('')} className="absolute right-1 [@media(pointer:coarse)]:right-0 top-1/2 -translate-y-1/2 w-7 h-7 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 rounded-btn flex items-center justify-center text-ink-3 hover:text-ink hover:bg-card-2"><Icon name="fechar" size={16} /></button>}
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
    const r = rectUi(btn.current!), vh = viewportUi().h;
    const up = r.bottom + 296 > vh && r.top > vh - r.bottom;
    setPos(up ? { left: r.left, bottom: vh - r.top + 4, width: r.width } : { left: r.left, top: r.bottom + 4, width: r.width });
    setAct(Math.max(0, sel)); setOpen(true);
  };
  const pick = (i: number) => { setOpen(false); btn.current?.focus(); if (opts[i] && i !== sel) { signalEdit(btn.current); onChange?.({ target: { value: opts[i].value } }); } };
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
              className={cx('flex items-center gap-icon px-stack py-tight [@media(pointer:coarse)]:py-stack rounded-btn text-body cursor-pointer', i === act && 'bg-surface-muted', i === sel && 'font-medium')}>
              <span className="flex-1">{o.label}</span>{i === sel && <Icon name="ok" size={16} className="shrink-0" />}
            </li>
          ))}
        </ul>, document.body)}
    </>
  );
}
// Combobox com busca: campo de texto que filtra a lista conforme o usuário digita, numa lista suspensa
// (portal, como o Select). `onQuery` é opcional — quando informado, simula o carregamento dos registros
// (ex.: buscar no servidor) em vez de filtrar a lista inteira já carregada; sem ele, filtra `options` local.
export type SearchSelectOption = { value: string; label: string; sub?: string };
export function SearchSelect({ options, value, onChange, onQuery, placeholder = 'Buscar…', className = '', emptyLabel = 'Nenhum resultado', ...p }: {
  options: SearchSelectOption[]; value?: string; onChange: (value: string) => void; onQuery?: (q: string) => Promise<SearchSelectOption[]>;
  placeholder?: string; className?: string; emptyLabel?: string; 'aria-label'?: string;
}) {
  const selected = options.find((o) => o.value === (value ?? ''));
  const [query, setQuery] = useState(selected?.label || '');
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchSelectOption[]>(options);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number }>({ left: 0, top: 0, width: 0 });
  const pres = usePresence(open);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const lid = useId();
  const seq = useRef(0);

  useEffect(() => { if (!open) setQuery(selected?.label || ''); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const q = query.trim().toLowerCase();
    const id = ++seq.current;
    if (onQuery) {
      setLoading(true);
      const t = setTimeout(() => onQuery(q).then((r) => { if (id === seq.current) { setResults(r); setLoading(false); setAct(0); } }), 180);
      return () => clearTimeout(t);
    }
    setLoading(true);
    const t = setTimeout(() => { setResults(q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.sub?.toLowerCase().includes(q)) : options); setLoading(false); setAct(0); }, 150);
    return () => clearTimeout(t);
  }, [query, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = () => { const r = rectUi(box.current!), vh = viewportUi().h; const up = r.bottom + 296 > vh && r.top > vh - r.bottom; setPos(up ? { left: r.left, bottom: vh - r.top + 4, width: r.width } : { left: r.left, top: r.bottom + 4, width: r.width }); };
  const show = () => { place(); setOpen(true); };
  const pick = (o: SearchSelectOption | null) => { setOpen(false); signalEdit(input.current); onChange(o?.value ?? ''); setQuery(o?.label ?? ''); input.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const out = (e: Event) => { if (!list.current?.contains(e.target as Node) && !box.current?.contains(e.target as Node)) setOpen(false); };
    const scroll = (e: Event) => { if (!list.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', out); window.addEventListener('scroll', scroll, true); window.addEventListener('resize', scroll);
    return () => { document.removeEventListener('mousedown', out); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll); };
  }, [open]);
  useEffect(() => { if (open) list.current?.children[act]?.scrollIntoView({ block: 'nearest' }); }, [open, act]);
  const key = (e: React.KeyboardEvent) => {
    if (!open) { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); show(); } return; }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(selected?.label || ''); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[act]) pick(results[act]); }
  };
  return (
    <div ref={box} className={cx('relative', className)}>
      <Icon name="busca" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
      <input ref={input} role="combobox" aria-expanded={open} aria-controls={lid} aria-autocomplete="list" aria-label={p['aria-label']}
        value={query} placeholder={placeholder} onKeyDown={key}
        onFocus={show} onChange={(e) => { setQuery(e.target.value); if (!open) show(); }}
        className={cx(inputCls, 'pl-10 pr-10 [@media(pointer:coarse)]:pr-11')} />
      {(query || value) && <button type="button" aria-label="Limpar" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)} className="absolute right-1 [@media(pointer:coarse)]:right-0 top-1/2 -translate-y-1/2 w-7 h-7 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 rounded-btn flex items-center justify-center text-ink-3 hover:text-ink hover:bg-card-2"><Icon name="fechar" size={16} /></button>}
      {pres.mounted && createPortal(
        <ul ref={list} id={lid} role="listbox" aria-label={p['aria-label']} onMouseDown={(e) => e.preventDefault()}
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width }}
          className={cx('fixed z-[1400] max-h-72 max-w-[min(420px,calc(100vw-16px))] overflow-y-auto bg-card border border-line rounded-pop shadow-pop p-1', pres.closing ? 'anim-out' : 'anim-page')}>
          {loading ? <li className="flex items-center gap-icon px-stack py-tight text-small text-ink-2"><Spinner size={14} />Carregando registros…</li>
            : results.length === 0 ? <li className="px-stack py-tight text-small text-ink-2">{emptyLabel}</li>
            : results.map((o, i) => (
              <li key={o.value} id={`${lid}-${i}`} role="option" aria-selected={o.value === value} onMouseEnter={() => setAct(i)} onClick={() => pick(o)}
                className={cx('flex flex-col px-stack py-tight [@media(pointer:coarse)]:py-stack rounded-btn text-body cursor-pointer', i === act && 'bg-surface-muted', o.value === value && 'font-medium')}>
                <span className="flex items-center gap-icon"><span className="flex-1 truncate">{o.label}</span>{o.value === value && <Icon name="ok" size={16} className="shrink-0" />}</span>
                {o.sub && <span className="text-caption text-ink-2 truncate">{o.sub}</span>}
              </li>
            ))}
        </ul>, document.body)}
    </div>
  );
}
export function Textarea({ className = '', ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx('w-full border border-line-strong rounded-ctl p-3 text-body text-ink bg-card placeholder:text-ink-3 hover:border-line-hover focus:outline-none transition-colors disabled:bg-surface-muted disabled:text-ink-3', className)} />;
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
        <span aria-hidden="true" className={cx('w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-colors duration-150', peerFocus,
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
        <span aria-hidden="true" className={cx('w-[18px] h-[18px] rounded-pill border-[1.5px] flex items-center justify-center transition-colors duration-150', peerFocus,
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
      <span aria-hidden="true" className={cx('w-10 h-6 rounded-pill bg-switch-off transition-colors duration-150 peer-checked:bg-brand-fill peer-disabled:opacity-45 peer-disabled:cursor-not-allowed after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-pill after:bg-card after:shadow-seg after:transition-transform after:duration-[120ms] peer-checked:after:translate-x-4', peerFocus)} />
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
// Faixa que rola de lado (celular): a borda do lado onde há mais conteúdo esmaece (data-fade, base.css) — sem barra de
// rolagem, o que estava fora da tela não dava nenhum sinal de que existia. Sem rolagem (desktop), nada esmaece.
export function useEdgeFade(box: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const cue = () => { const max = el.scrollWidth - el.clientWidth; el.dataset.fade = max <= 1 ? '' : el.scrollLeft <= 1 ? 'r' : el.scrollLeft >= max - 1 ? 'l' : 'lr'; };
    cue();
    el.addEventListener('scroll', cue, { passive: true });
    const ro = new ResizeObserver(cue);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', cue); ro.disconnect(); };
  }, [box]);
}

function useSlider(value: string) {
  const box = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  useEdgeFade(box);
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
      // trilho rolando de lado (celular): centraliza a opção ativa se ela estiver fora da vista
      if (el.scrollWidth > el.clientWidth && (next.x < el.scrollLeft || next.x + next.w > el.scrollLeft + el.clientWidth))
        el.scrollTo({ left: next.x - (el.clientWidth - next.w) / 2, behavior: from ? 'smooth' : 'auto' });
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
// Visual único do controle segmentado (trilho em pílula + indicador que desliza na cor da revenda),
// compartilhado por Tabs (estado) e NavTabs (rota) — mudar a forma aqui muda em toda a tela que usa qualquer um dos dois.
// Celular: o trilho não quebra linha (viraria um bloco de 2–3 linhas com o indicador andando na diagonal); rola de lado,
// e a opção ativa é trazida para a vista (useSlider).
const segTrack = 'relative inline-flex flex-wrap max-md:flex-nowrap max-md:overflow-x-auto max-md:overscroll-x-contain max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden w-fit max-w-full gap-1 p-1 bg-card rounded-pill';
const segIndicator = 'absolute rounded-pill bg-brand-fill';
const segItem = (size: 'sm' | 'md', on: boolean, style: unknown) => cx('relative shrink-0 whitespace-nowrap px-3 rounded-pill font-medium inline-flex items-center gap-tight', size === 'sm' ? 'h-7 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11 justify-center text-caption' : 'h-8 [@media(pointer:coarse)]:h-11 text-small', sliderText, on ? cx('text-brand-fill-ink', !style && 'bg-brand-fill') : 'text-ink-2 hover:text-ink');

// Contador neutro (abas, filtros, listas). O do "Precisa de você" é o único vermelho (Layout).
export function CountBadge({ n, className = '' }: { n: number; className?: string }) {
  return <span className={cx('min-w-[20px] h-5 px-2 rounded-pill bg-[var(--counter-bg)] text-[var(--counter-ink)] text-caption font-semibold inline-flex items-center justify-center num', className)}>{n > 99 ? '99+' : n}</span>;
}
// Controle segmentado: opção ativa na cor da revenda (--brand-fill, com fallback grafite), indicador que desliza.
type TabItem = { key: string; label: string; count?: number };
export function Tabs({ tabs, value, onChange, size = 'md', className = '' }: { tabs: TabItem[]; value: string; onChange: (k: string) => void; size?: 'sm' | 'md'; className?: string }) {
  const { box, indicator, style } = useSlider(value);
  return (
    <div ref={box} role="tablist" className={cx(segTrack, className)}>
      {style && <span ref={indicator} aria-hidden="true" style={style} className={segIndicator} />}
      {tabs.map((t) => {
        const on = value === t.key;
        return <button key={t.key} data-k={t.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.key)} className={segItem(size, on, style)}>
          {t.label}{t.count != null && <span className={cx('num text-caption', on ? 'opacity-80' : 'text-ink-3')}>{t.count}</span>}
        </button>;
      })}
    </div>
  );
}
// Controle segmentado por rota (igual ao Tabs, mas cada opção é um link de navegação em vez de estado controlado).
// Usa NavLink (sem preventDefault/navegação própria) para não recarregar a página ao trocar de aba.
type NavTabItem = { to: string; label: string; end?: boolean };
export function NavTabs({ tabs, size = 'md', className = '' }: { tabs: NavTabItem[]; size?: 'sm' | 'md'; className?: string }) {
  const { pathname } = useLocation();
  const active = tabs.find((t) => (t.end ? pathname === t.to : pathname.startsWith(t.to)))?.to ?? tabs[0]?.to;
  const { box, indicator, style } = useSlider(active);
  return (
    <div ref={box} role="tablist" className={cx(segTrack, className)}>
      {style && <span ref={indicator} aria-hidden="true" style={style} className={segIndicator} />}
      {tabs.map((t) => {
        const on = t.to === active;
        return <NavLink key={t.to} to={t.to} end={t.end} data-k={t.to} className={segItem(size, on, style)}>{t.label}</NavLink>;
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
      {options.map((o) => <button key={o.key} data-k={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} className={cx('relative h-ctl-sm px-3 rounded-pill text-small font-medium border', sliderText, value === o.key ? cx('text-brand-fill-ink border-transparent', !style && 'bg-brand-fill') : 'border-line-strong text-ink hover:bg-card-2')}>{o.label}</button>)}
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
            className={cx('min-w-ctl-sm h-ctl-sm px-2 rounded-pill text-small num transition-colors', x === page ? 'bg-brand-fill text-brand-fill-ink font-semibold' : 'text-ink hover:bg-surface-muted')}>{x + 1}</button>)}
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
    <span className="h-7 [@media(pointer:coarse)]:h-ctl-sm pl-3 pr-1 rounded-pill bg-surface-selected border border-line text-small text-ink inline-flex items-center gap-1">
      {label}<button type="button" aria-label={`Remover filtro ${typeof label === 'string' ? label : ''}`} onClick={onRemove} className="w-5 h-5 [@media(pointer:coarse)]:w-8 [@media(pointer:coarse)]:h-8 rounded-pill flex items-center justify-center text-ink-2 hover:text-ink hover:bg-surface-hover"><Icon name="fechar" size={14} /></button>
    </span>
  );
}
// Gatilho do FilterSheet no cabeçalho único do mobile (Layout.tsx): o ícone de filtro mora ao lado do título
// e da ação de criar, não solto no meio do conteúdo — um registro por tela, igual ao useMobilePageAction.
export const MobileFilterCtx = createContext<{ slot: { count: number; onOpen: () => void } | null; set: (s: { count: number; onOpen: () => void } | null) => void } | null>(null);
// Filtros de lista no mobile (item 2 de docs/PLANO-MOBILE.md): no desktop, `children` renderiza inline, sem mudança.
// Abaixo de md, os mesmos filtros (Select, SearchSelect, o que for) ficam escondidos dentro de um Sheet; quem abre
// é o ícone de filtro no cabeçalho (registrado via `MobileFilterCtx`), não um botão solto aqui no conteúdo — mantém
// o cabeçalho como o único lugar de ações da tela, igual à referência do Visor. `count` é calculado por quem chama
// (quantos filtros estão fora do valor padrão).
export function FilterSheet({ label = 'Filtros', count = 0, children }: { label?: string; count?: number; children: React.ReactNode }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const pres = usePresence(open);
  const headerSlot = useContext(MobileFilterCtx);
  const openRef = useRef(() => setOpen(true)); openRef.current = () => setOpen(true);
  useEffect(() => {
    if (!mobile || !headerSlot) return;
    headerSlot.set({ count, onOpen: () => openRef.current() });
    return () => headerSlot.set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, headerSlot, count]);
  if (!mobile) return <>{children}</>;
  return (
    // modal (não FloatingPanel): filtro é um diálogo que se escolhe e fecha, não um painel de detalhe para
    // espiar com o conteúdo por trás — modal={false} abriria recolhido, exigindo arrastar para ver os campos.
    pres.mounted ? (
      <Sheet modal label={label} title={label} onClose={() => setOpen(false)} closing={pres.closing}>
        <div className="flex flex-col gap-field">{children}</div>
      </Sheet>
    ) : null
  );
}
// Conteúdo da aba: fade curto (--t-swap) a cada troca, sem deslocamento. Use com a mesma key da aba.
// Valor que mora no Setup do gestor (camadas empresa e grupo) mostrado dentro de um módulo: só leitura, com o caminho
// para ajustar. O padrão e os limites vêm do Setup da Localle (plataforma); o gestor adapta a operação no dele.
export function SetupLink({ aba, className = '' }: { aba: string; className?: string }) {
  return <NavLink to={`/setup?aba=${aba}`} className={cx('inline-flex items-center gap-icon text-small font-medium link-brand', className)}><Icon name="config" size={16} />Ajustar no Setup</NavLink>;
}

// "Para salvar, falta: …" ao lado do botão desabilitado (padrão nascido na Cercas): botão cinza sozinho não diz o que fazer.
export function Missing({ items, className = '' }: { items: (string | false | null | undefined | 0 | '')[]; className?: string }) {
  const l = items.filter(Boolean) as string[];
  if (!l.length) return null;
  const txt = l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0];
  return <span role="status" className={cx('text-caption text-ink-2', className)}>Para salvar, falta: {txt}.</span>;
}

// loading: primeira carga do módulo ainda vindo da API (lib/localleApi › useCarregando) — esqueleto no lugar do conteúdo,
// para a lista vazia ("Nenhuma multa…") não aparecer antes dos dados
export function TabPanel({ id, loading, className = '', children }: { id: string; loading?: boolean; className?: string; children: React.ReactNode }) {
  return <div key={id} role="tabpanel" aria-busy={loading || undefined} className={cx('anim-swap', className)}>{loading ? <LoadingBlock /> : children}</div>;
}

export function LoadingBlock() {
  return (
    <div className="flex flex-col gap-grid">
      <span className="sr-only" role="status">Carregando…</span>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-grid">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 'max-w-2xl', footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: string; footer?: React.ReactNode }) {
  const { mounted, closing } = usePresence(open);
  useScrollLock(open);
  // na saída, mostra o último conteúdo aberto (quem chamou costuma zerar os dados ao fechar)
  const last = useRef({ title, children, footer });
  if (open) last.current = { title, children, footer };
  // Esc fecha só o diálogo do topo; popovers internos (lista, calendário) tratam o Esc antes e marcam defaultPrevented
  const box = useRef<HTMLDivElement>(null);
  // Formulário com algo preenchido não fecha por acidente: toque fora e arrasto para baixo não fecham, e X/Esc perguntam
  // antes de descartar. "Preenchido" = qualquer digitação ou escolha dentro do modal (evento input dos campos nativos e
  // EDIT_EVENT dos campos próprios: Select, SearchSelect, DateInput). Os botões do rodapé (Cancelar, Salvar) chamam o
  // onClose de quem abriu direto, sem pergunta: ali a intenção é explícita.
  const closeRef = useRef(onClose); closeRef.current = onClose;
  // quem abriu: lido no render da abertura, antes do commit — depois dele o autoFocus de um campo já tirou o foco do botão
  const opener = useRef<HTMLElement | null>(null), wasOpen = useRef(false), restore = useRef<ReturnType<typeof setTimeout>>();
  if (open && !wasOpen.current && typeof document !== 'undefined') opener.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;
  const touched = useRef(false);
  useEffect(() => {
    if (!open) return;
    touched.current = false;
    const el = box.current;
    const mark = () => { touched.current = true; };
    el?.addEventListener('input', mark); el?.addEventListener(EDIT_EVENT, mark);
    return () => { el?.removeEventListener('input', mark); el?.removeEventListener(EDIT_EVENT, mark); };
  }, [open, mounted]);
  const requestClose = async () => {
    if (touched.current && !(await confirmAction({ title: 'Descartar o que foi preenchido?', detail: 'As informações deste formulário ainda não foram salvas e serão perdidas.', confirmLabel: 'Descartar', cancelLabel: 'Continuar editando' }))) return;
    closeRef.current();
  };
  // Foco (mesma regra do Sheet): ao abrir entra no diálogo — campo com autoFocus já está dentro e fica —, o Tab circula
  // só dentro do diálogo do topo, e ao fechar volta para quem abriu (sem isso o leitor de tela ficava na página de trás
  // e, ao fechar, caía no início do documento).
  useEffect(() => {
    if (!open) return;
    clearTimeout(restore.current);
    const back = opener.current;
    const topo = () => { const all = document.querySelectorAll('[aria-modal="true"]'); return all[all.length - 1] === box.current; };
    const focusables = () => Array.from(box.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])') || [])
      .filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'));
    if (!box.current?.contains(document.activeElement)) (focusables()[0] ?? box.current)?.focus({ preventScroll: true });
    const k = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !topo()) return;
      if (e.key === 'Escape') { e.preventDefault(); void requestClose(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) { e.preventDefault(); return; }
      const dentro = box.current?.contains(document.activeElement);
      if (e.shiftKey && (!dentro || document.activeElement === f[0])) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (!dentro || document.activeElement === f[f.length - 1])) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown', k);
    // devolve no fim da tarefa: a remontagem imediata do StrictMode cancela (senão tiraria o foco do campo com autoFocus),
    // e só devolve se o foco ficou sem dono — outro diálogo que abriu em seguida, ou a troca de tela, ficam com ele
    return () => {
      document.removeEventListener('keydown', k);
      const el = box.current;
      restore.current = setTimeout(() => {
        const a = document.activeElement;
        if (back?.isConnected && (!a || a === document.body || !a.isConnected || el?.contains(a))) back.focus({ preventScroll: true });
      }, 0);
    };
  }, [open]);
  const mobile = useIsMobile();
  const drag = useSheetDrag(box, (dy, vy) => { if (dy > 64 || vy > 0.5) void requestClose(); });
  if (!mounted) return null;
  const c = last.current;
  // portal no body: o modal não fica preso a painéis com transform/z-index de quem o abriu.
  // Celular: folha inferior (mesma linguagem do Sheet) — encosta embaixo, sobe de baixo, alça e cabeçalho arrastam para
  // fechar; formulário longo rola o fundo inteiro e o mt-auto mantém o topo alcançável (items-end cortaria o topo).
  // max-md:justify-start: em coluna, o justify-center do desktop centralizava na vertical, e o form mais alto que a tela
  // estourava metade para cima, fora da rolagem — o modal abria no meio do formulário, sem como subir até o título.
  return createPortal(
    <div className={cx('fixed inset-0 z-[1300] bg-scrim flex items-start justify-center p-4 md:p-10 overflow-y-auto overscroll-contain max-md:flex-col max-md:justify-start max-md:items-stretch max-md:p-0 max-md:pt-[8dvh]', closing ? 'anim-fade-out' : 'anim-fade')} onMouseDown={(e) => e.target === e.currentTarget && !touched.current && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={c.title} tabIndex={-1} className={cx('w-full outline-none bg-card rounded-panel shadow-modal p-card bleed-card flex flex-col max-md:mt-auto max-md:rounded-b-none max-md:shadow-[var(--shadow-sheet)] max-md:pb-[max(var(--pad-card),env(safe-area-inset-bottom))] transition-[translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]', closing ? 'anim-out max-md:[animation:sheet-out_180ms_var(--ease-in)_forwards]' : 'anim-page max-md:[animation:sheet-in_280ms_var(--ease-out)_backwards]', width)}>
        <div {...(mobile ? drag : {})} className="max-md:touch-none max-md:select-none max-md:-mt-card max-md:pt-2">
          <span aria-hidden="true" className="md:hidden block mx-auto mb-stack w-10 h-1 rounded-pill bg-line-strong" />
          <div className="flex items-center gap-stack mb-card-head"><h2 className="text-h2 font-semibold mr-auto">{c.title}</h2><IconButton aria-label="Fechar" size="sm" className="-mr-1" onClick={() => void requestClose()}><Icon name="fechar" /></IconButton></div>
        </div>
        <HeadingLevel level={3}><div className="flex flex-col gap-field min-w-0">{c.children}</div></HeadingLevel>
        {/* celular: formulário longo não esconde as ações lá embaixo; o rodapé gruda no fim da tela enquanto o modal rola */}
        {c.footer && <div className="flex flex-wrap justify-end gap-tight mt-form-actions pt-card-foot border-t border-line max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-card max-md:px-card max-md:-mb-card max-md:pb-card max-md:bg-card max-md:rounded-b-panel">{c.footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// Trilha de navegação: usada quando a tela é uma sub-tela de algo (ex.: Relatórios > Cercas).
// O último item é a página atual (sem link); os anteriores navegam de volta.
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  const navigate = useNavigate();
  return (
    <nav aria-label="Trilha de navegação" className="flex items-center gap-tight text-small text-ink-2 mb-tight min-w-0">
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-tight min-w-0">
            {i > 0 && <Icon name="chevron" size={12} className="shrink-0 text-ink-3" />}
            {last || !it.to
              ? <span className={cx('truncate', last && 'text-ink font-medium')}>{it.label}</span>
              : <button type="button" onClick={() => navigate(it.to!)} className="alvo-toque min-w-0 max-w-full hover:text-ink hover:underline underline-offset-2"><span className="block truncate">{it.label}</span></button>}
          </span>
        );
      })}
    </nav>
  );
}

// Cabeçalho de página sem o nome da tela à vista (04/11/2026: o menu já diz onde se está); o título segue no h1 para
// leitor de tela. A linha fica com as ações (e o período, em telas de BI), na altura do botão "Precisa de você".
// Sem ações, sobra só a linha vazia no desktop, para o conteúdo não passar por baixo desse botão.
// `crumbs` é opcional: usar em sub-telas (ex.: um tipo de relatório dentro do hub de Relatórios).
export function PageHeader({ title, children, period, crumbs }: { icon?: Parameters<typeof Icon>[0]['name']; title: string; subtitle?: React.ReactNode; children?: React.ReactNode; period?: React.ReactNode; crumbs?: { label: string; to?: string }[] }) {
  const acoes = !!(period || children);
  return (
    <header className={cx('flex flex-col', acoes ? 'mb-page-head' : 'mb-card-head')}>
      {/* desktop: sr-only (o menu já diz onde se está, PRODUCT.md). Mobile: oculto por completo — o
          <h1> visível mora na barra fixa do Layout (item 4 de docs/PLANO-MOBILE.md, cabeçalho único
          no padrão do Visor); ter os dois ao mesmo tempo duplicaria o heading da página. */}
      <h1 className="md:sr-only max-md:hidden">{title}</h1>
      {crumbs && <Breadcrumbs items={crumbs} />}
      <div className={cx('flex flex-wrap items-center gap-x-6 gap-y-tight min-h-ctl md:pr-[var(--top-reserve,0px)]', !acoes && 'max-md:hidden')}>
        {acoes && <div className="flex flex-wrap items-center gap-tight min-w-0 max-w-full">{period}{children}</div>}
      </div>
    </header>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'red' | 'green' | 'orange' }) {
  // número sempre em --ink; o tom vira um ponto ao lado do rótulo (verde não marca status)
  const dot = tone === 'red' ? 'bg-crit' : tone === 'orange' ? 'bg-warn' : '';
  return (
    <div className="bg-card shadow-card rounded-card p-card-sm flex flex-col min-w-0 [container-type:inline-size]">
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
// `card`: versão empilhada para telas estreitas (abaixo de md), no lugar da tabela larga. Sem `card`, uma tabela que não
// cabe no celular (minWidth > 480) ganha a versão automática (autoCard); `card={false}` mantém a rolagem lateral
// (matriz em que a leitura cruzada importa).
// Acima de `pageSize` linhas, pagina e mostra o total. Coluna de cabeçalho vazia ('') = ações, alinhada à direita.
// align: alinhamento por coluna (números à direita). selected: linhas marcadas (fundo neutro; o checkbox fica com quem usa).
// loading: linhas de esqueleto. emptyState: estado vazio rico (ilustração), no lugar do texto `empty`.
export function Table({ head, rows, empty = 'Nada por aqui ainda.', emptyState, minWidth = 640, onRow, pageSize = 50, card: cardProp, align, selected, loading, dense }: {
  head: React.ReactNode[]; rows: React.ReactNode[][]; empty?: string; emptyState?: React.ReactNode; minWidth?: number; onRow?: (i: number) => void; pageSize?: number;
  card?: ((i: number) => React.ReactNode) | false; align?: ('left' | 'right' | 'center')[]; selected?: (i: number) => boolean; loading?: boolean; dense?: boolean;
}) {
  const card = cardProp === false ? undefined : cardProp ?? (minWidth > 480 ? (i: number) => <AutoCard head={head} row={rows[i]} /> : undefined);
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
          {loading && Array.from({ length: 4 }, (_, i) => <li key={'sk' + i} className="border-t border-line py-stack px-[max(var(--bleed),var(--cell-x))] first:border-t-0 flex flex-col gap-tight"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-full max-w-[220px]" /></li>)}
          {!loading && rows.length === 0 && <li>{emptyNode}</li>}
          {!loading && shown.map((_, i) => <li key={from + i} onClick={onRow && (() => onRow(from + i))} className={cx('border-t border-line py-stack px-[max(var(--bleed),var(--cell-x))] first:border-t-0', onRow && 'cursor-pointer active:bg-card-2', selected?.(from + i) && 'bg-surface-selected')}>{card(from + i)}</li>)}
        </ul>
      )}
      <div className={cx('overflow-x-auto -mx-bleed', card && 'hidden md:block')}>
        <table className="w-full border-collapse text-body" style={{ minWidth }}>
          <thead><tr className="text-ink-2 text-caption">{head.map((h, i) => <th key={i} className={cx(CELL_X, 'h-10 font-medium border-b border-line', al(i))}>{act(i) ? <span className="sr-only">Ações</span> : h}</th>)}</tr></thead>
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

// Versão empilhada automática de uma linha da tabela (celular). Colunas de cabeçalho vazio ou não textual antes da
// primeira coluna nomeada (miniatura, seleção) ficam à esquerda; a primeira coluna nomeada é o título; a primeira
// coluna que é só um Badge (a situação) sobe para a linha do título, que é o que se lê primeiro na lista; as demais
// viram pares rótulo/valor, sem os vazios ("—"). Ações (cabeçalho '' no fim): um botão de ícone ou menu fica no canto;
// ações em texto descem para uma linha própria, quebrando, com altura de toque — no canto, 2 ou 3 delas espremiam o
// título até uma palavra por linha.
const vazioCel = (c: React.ReactNode): boolean => c == null || c === '' || c === false || c === '—'
  || (React.isValidElement(c) && (c.props as { children?: React.ReactNode }).children === '—');
function AutoCard({ head, row }: { head: React.ReactNode[]; row: React.ReactNode[] }) {
  if (!row) return null;
  const last = head.length - 1;
  const actIdx = last > 0 && head[last] === '' ? last : -1;
  const titleIdx = Math.max(0, head.findIndex((h, j) => j !== actIdx && typeof h === 'string' && h !== ''));
  const statusIdx = row.findIndex((c, j) => j > titleIdx && j !== actIdx && React.isValidElement(c) && c.type === Badge);
  const lead = row.slice(0, titleIdx).filter((c) => !vazioCel(c));
  const act = actIdx > 0 && !vazioCel(row[actIdx]) ? row[actIdx] : null;
  const actIcone = React.isValidElement(act) && (act.type === Menu || act.type === IconButton);
  return (
    <div className="flex items-start gap-stack min-w-0">
      {lead.length > 0 && <div className="shrink-0 flex items-center gap-tight" onClick={(e) => e.stopPropagation()}>{lead.map((c, k) => <React.Fragment key={k}>{c}</React.Fragment>)}</div>}
      <div className="flex-1 min-w-0 flex flex-col gap-tight">
        <div className="flex items-start justify-between gap-stack min-w-0">
          <div className="text-body font-medium min-w-0 break-words">{row[titleIdx]}</div>
          {statusIdx > 0 && <div className="shrink-0 pt-px">{row[statusIdx]}</div>}
        </div>
        <dl className="flex flex-col gap-hair text-small">
          {row.map((c, j) => j <= titleIdx || j === actIdx || j === statusIdx || vazioCel(c) ? null : (
            <div key={j} className="flex items-baseline justify-between gap-stack min-w-0">
              <dt className="text-ink-2 shrink-0 max-w-[45%]">{head[j]}</dt>
              <dd className="min-w-0 text-right break-words num">{c}</dd>
            </div>
          ))}
        </dl>
        {act && !actIcone && <CardActions>{act}</CardActions>}
      </div>
      {act && actIcone && <div className="shrink-0 -mr-1 -mt-1 flex items-center" onClick={(e) => e.stopPropagation()}>{act}</div>}
    </div>
  );
}

// Linha de ações em texto de um card de lista (celular): alinhada à esquerda, quebra, 44 px de altura com o dedo.
// Desfaz o `justify-end` da célula de ações da tabela larga quando ela é reaproveitada aqui.
export function CardActions({ children }: { children: React.ReactNode }) {
  return (
    <div onClick={(e) => e.stopPropagation()}
      className="flex flex-wrap items-center gap-x-5 [@media(pointer:coarse)]:-my-tight [&>div]:flex [&>div]:flex-wrap [&>div]:!justify-start [&>div]:gap-x-5 [@media(pointer:coarse)]:[&_button]:min-h-11 [&_button]:text-left">
      {children}
    </div>
  );
}

// Menu de ações (o "…" da linha): abre em portal; itens com ícone; danger = ação destrutiva em vermelho, separada.
// danger: ação destrutiva — fica vermelha e vai para o grupo do fim do menu
export type MenuItem = { label: string; icon?: string; onClick: () => void; danger?: boolean; disabled?: boolean };
export function Menu({ items, label = 'Mais opções', trigger }: { items: MenuItem[]; label?: string; trigger?: (p: { ref: React.Ref<HTMLButtonElement>; open: boolean; toggle: () => void }) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number }>({ right: 0, top: 0 });
  const pres = usePresence(open);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = rectUi(btn.current!), { w: vw, h: vh } = viewportUi();
    const up = r.bottom + 48 * items.length + 16 > vh;
    setPos(up ? { right: vw - r.right, bottom: vh - r.top + 4 } : { right: vw - r.right, top: r.bottom + 4 });
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
      className={cx('w-full flex items-center gap-icon px-stack h-9 [@media(pointer:coarse)]:h-11 rounded-btn text-body text-left disabled:opacity-40', x.danger ? 'text-crit-ink hover:bg-crit-soft focus:bg-crit-soft' : 'text-ink hover:bg-surface-muted focus:bg-surface-muted')}>
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
          if (f.size > maxMB * 1024 * 1024) { toast.error(`Os arquivos ficam guardados no navegador; envie um arquivo de até ${maxMB} MB.`, `"${f.name}" passa de ${maxMB} MB`); continue; }
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
// Sombra feita aqui, igual para todas (os mestres em alta vêm sem sombra de chão, docs/ASSETS-3D-PROMPTS.md).
const ILU = import.meta.glob('../images/ilustracoes/ilu-*.png', { eager: true, import: 'default' }) as Record<string, string>;
const ILU_WEB = import.meta.glob('../images/ilustracoes/web/ilu-*.webp', { eager: true, import: 'default' }) as Record<string, string>;
export const ILLUSTRATION_IDS = Object.keys(ILU).map((p) => p.replace(/^.*\/(ilu-[^/]+)\.png$/, '$1')).sort();
const iluUrl = (id: string) => Object.entries(ILU).find(([p]) => p.endsWith(`/${id}.png`))?.[1];
const iluWeb = (id: string, size: 'page' | 'panel') => Object.entries(ILU_WEB).find(([p]) => p.endsWith(`/${id}-${size}.webp`))?.[1];
export function Illustration({ id, size = 'page', className = '' }: { id: string; size?: 'page' | 'panel'; className?: string }) {
  const dim = size === 'page' ? 'w-40 h-32' : 'w-24 h-[77px]';
  const url = iluUrl(id), web = iluWeb(id, size);
  const img = url && <img src={url} alt="" draggable={false} loading="lazy" decoding="async" width={size === 'page' ? 160 : 96} height={size === 'page' ? 128 : 77} className={cx(dim, 'object-contain shrink-0 [filter:drop-shadow(0_6px_8px_rgba(17,24,39,0.12))]', className)} />;
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
  if (asset?.photo) return <img src={asset.photo} alt={`Foto de ${asset.name}`} loading="lazy" decoding="async" className={cx('rounded-tight object-cover shrink-0', className)} />;
  const icon = asset?.icon && pngIconUrl(asset.icon);
  if (icon) return <img src={icon} alt="" draggable={false} decoding="async" className={cx('object-contain shrink-0', className)} />;
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
  const emit = (s: string) => { signalEdit(btn.current); if (value === undefined) setOwn(s); onChange?.({ target: { value: s } }); };
  const cut = type === 'month' ? 7 : 10;
  const lo = min?.slice(0, cut), hi = max?.slice(0, cut);
  const ok = (s: string) => (!lo || s >= lo) && (!hi || s <= hi);
  const show = () => {
    const r = rectUi(btn.current!), h = type === 'datetime-local' ? 420 : 370, { w: vw, h: vh } = viewportUi();
    const up = r.bottom + h > vh && r.top > vh - r.bottom;
    const left = Math.min(r.left, vw - 300);
    setPos(up ? { left, bottom: vh - r.top + 4 } : { left, top: r.bottom + 4 });
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
  const navBtn = 'w-ctl-sm h-ctl-sm rounded-btn flex items-center justify-center text-ink-2 hover:bg-card-2 hover:text-ink';
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
      // foco inicial no lado seguro: em ação destrutiva (Descartar, Excluir) um Enter apressado só cancela; em ação comum
      // (tone primary, ex.: Sair) o Enter confirma
      footer={<><Button variant="ghost" autoFocus={r?.tone !== 'primary'} onClick={() => done(false)}>{r?.cancelLabel || 'Cancelar'}</Button><Button autoFocus={r?.tone === 'primary'} variant={r?.tone === 'primary' ? 'primary' : 'danger'} onClick={() => done(true)}>{r?.confirmLabel || 'Excluir'}</Button></>}>
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
      <div aria-live="polite" className="fixed z-[1500] bottom-4 max-md:bottom-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] left-4 right-4 sm:left-auto flex flex-col items-end gap-2 pointer-events-none">{/* celular: acima da barra inferior */}
        {toastItems.map((t) => <ToastView key={t.id} t={t} />)}
      </div>,
      document.body,
    )}
  </>;
}
