import { createContext, forwardRef, useContext, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { cx, useIsMobile, useScrollLock } from './ui';
import { Icon, type IconName } from './icons';
import { animarGesto } from '../lib/gestos';

// Porte do Sidebar oficial do shadcn/ui (https://ui.shadcn.com/docs/components/base/sidebar)
// para Tailwind v3 e sem radix-ui/cva/lucide: mesma API e os mesmos data-attributes de estado
// (data-state, data-collapsible, data-side), reimplementados sobre nosso design system próprio
// (tokens.css) em vez do tema de cores deles. Larguras e cores seguem as nossas (72/248px).

export const SIDEBAR_WIDTH = 248;
const SIDEBAR_WIDTH_MOBILE = 280;
export const SIDEBAR_WIDTH_ICON = 72;
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';
// v2: a barra passou a iniciar recolhida (sprint 28/10/2026, bug 7); chave nova para todos começarem assim uma vez,
// depois vale a escolha de cada usuário
const SIDEBAR_STORAGE_KEY = 'ui.sidebar.collapsed.v2';

type SidebarContextValue = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (v: boolean) => void;
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: (v: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar precisa estar dentro de <SidebarProvider>');
  return ctx;
}

const readStoredOpen = () => { try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '0'; } catch { return false; } };

export function SidebarProvider({ children, defaultOpen, style, className = '' }: { children: ReactNode; defaultOpen?: boolean; style?: CSSProperties; className?: string }) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [open, setOpenRaw] = useState(defaultOpen ?? readStoredOpen);
  const setOpen = (v: boolean) => { setOpenRaw(v); try { localStorage.setItem(SIDEBAR_STORAGE_KEY, v ? '0' : '1'); } catch { /* sem armazenamento */ } };
  const toggleSidebar = () => (isMobile ? setOpenMobile((v) => !v) : setOpen(!open));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toggleSidebar(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobile, open]);

  const value: SidebarContextValue = { state: open ? 'expanded' : 'collapsed', open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar };
  return (
    <SidebarContext.Provider value={value}>
      <div data-slot="sidebar-wrapper"
        style={{ ['--sidebar-width' as any]: `${SIDEBAR_WIDTH}px`, ['--sidebar-width-icon' as any]: `${SIDEBAR_WIDTH_ICON}px`, ...style }}
        className={cx('flex min-h-full w-full flex-1 flex-col md:flex-row', className)}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ collapsible = 'icon', dock, children }: { collapsible?: 'icon' | 'none'; dock?: { pill: ReactNode; action?: ReactNode }; children: ReactNode }) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === 'none') {
    return <div data-slot="sidebar" className="flex h-full flex-col bg-card text-ink" style={{ width: SIDEBAR_WIDTH }}>{children}</div>;
  }

  if (isMobile) {
    return dock
      ? <SidebarDock open={openMobile} onClose={() => setOpenMobile(false)} pill={dock.pill} action={dock.action}>{children}</SidebarDock>
      : <SidebarSheet open={openMobile} onClose={() => setOpenMobile(false)}>{children}</SidebarSheet>;
  }

  return (
    <div className="group hidden md:block" data-state={state} data-collapsible={state === 'collapsed' ? collapsible : ''} data-side="left" data-slot="sidebar">
      <div data-slot="sidebar-gap" className="relative shrink-0 bg-transparent transition-[width] duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ width: state === 'collapsed' ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH }} />
      <div data-slot="sidebar-container" className="fixed inset-y-0 left-0 z-20 hidden h-screen transition-[width] duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:flex"
        style={{ width: state === 'collapsed' ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH, left: 'env(safe-area-inset-left, 0px)' /* paisagem: fora do notch */ }}
        onTransitionEnd={(e) => { if (e.target !== e.currentTarget || e.propertyName !== 'width') return; window.dispatchEvent(new Event('resize')); /* Leaflet e gráficos remedem */ }}>
        <div data-slot="sidebar-inner" className="relative flex h-full w-full flex-col bg-card border-r border-line">
          {children}
          <SidebarTrigger />
        </div>
        <SidebarRail />
      </div>
    </div>
  );
}

// Equivalente ao Sheet do shadcn (drawer off-canvas no mobile), usando nossa própria sobreposição.
// Diálogo modal: Esc fecha, o foco entra na gaveta ao abrir e volta para quem a abriu ao fechar, o Tab não sai dela
// e a página de trás não rola.
function SidebarSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const box = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useScrollLock(open);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, 140);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open || !mounted) return;
    const back = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(box.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input,[tabindex]:not([tabindex="-1"])') || []);
    (box.current?.querySelector<HTMLElement>('a[aria-current="page"]') || focusables()[0])?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); back?.focus?.(); };
  }, [open, mounted]);
  if (!mounted) return null;
  return (
    <div className="md:hidden fixed inset-0 z-[1050] no-print" data-slot="sidebar" data-mobile="true">
      <div className={cx('absolute inset-0 bg-scrim', closing ? 'anim-fade-out' : 'anim-fade')} onClick={onClose} />
      <aside ref={box} role="dialog" aria-modal="true" aria-label="Menu" style={{ width: SIDEBAR_WIDTH_MOBILE }} className={cx('absolute left-0 top-0 h-full max-w-[85vw] bg-card border-r border-line overscroll-contain', closing ? 'anim-out' : 'anim-page')}>{children}</aside>
    </div>
  );
}

// Celular: barra inferior flutuante (ref. Visor, 03/11/2026 — #mobile-bottom-nav). Pílula com os atalhos e, ao lado, um
// botão redondo; "Mais" abre o menu inteiro numa gaveta que cresce da própria pílula (escala a partir da base) enquanto a
// pílula se recolhe. Fundo transparente só para capturar o toque fora. É diálogo enquanto aberta: Esc, foco preso na
// gaveta e no botão redondo (que vira Fechar), página de trás sem rolar. Larguras e alturas seguem o Visor: pílula de 62
// com itens de 54, 20 nas laterais, 24 acima da área segura.
function SidebarDock({ open, onClose, pill, action, children }: { open: boolean; onClose: () => void; pill: ReactNode; action?: ReactNode; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  // Recolhe pela direção da rolagem, não pela posição (Revolut, docs/pesquisa-ux/01-home-revolut.md § 6.1): ~60px seguidos
  // para baixo recolhe; ~40px para cima, ou perto do topo, expande. Atributo escrito direto no DOM (sem render a cada
  // rolagem). Aberta, com foco de teclado dentro ou com movimento reduzido, fica expandida.
  useEffect(() => {
    const el = box.current; if (!el) return;
    el.removeAttribute('data-recolhida');
    if (open || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let last = window.scrollY, acc = 0, raf = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY, dy = y - last; last = y;
      if (y < 60) { acc = 0; el.removeAttribute('data-recolhida'); return; }
      if (dy && Math.sign(dy) !== Math.sign(acc)) acc = 0;
      acc += dy;
      if (acc > 60) el.setAttribute('data-recolhida', '');
      else if (acc < -40) el.removeAttribute('data-recolhida');
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const onFocus = () => el.removeAttribute('data-recolhida');
    window.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('focusin', onFocus);
    return () => { window.removeEventListener('scroll', onScroll); el.removeEventListener('focusin', onFocus); if (raf) cancelAnimationFrame(raf); };
  }, [open]);
  const drawer = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(box.current?.querySelectorAll<HTMLElement>('[data-dock-open] a[href],[data-dock-open] button:not(:disabled),[data-dock-open] input,[data-dock-action] button') || []);
    (drawer.current?.querySelector<HTMLElement>('a[aria-current="page"]') || focusables()[0])?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('keydown', k); back?.focus?.(); };
  }, [open]);
  return (
    <nav ref={box} aria-label="Navegação" data-state={open ? 'open' : 'closed'} data-slot="sidebar" data-mobile="true" className="dock md:hidden no-print fixed inset-x-0 bottom-0 z-[1050] pointer-events-none">
      <div className="dock-backdrop fixed inset-0" aria-hidden="true" onClick={onClose} />
      <div className="pointer-events-auto relative flex items-end gap-2 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        <div className="relative min-w-0 flex-1">
          <div ref={drawer} role="dialog" aria-modal={open || undefined} aria-label="Menu" aria-hidden={!open || undefined} {...(open ? { 'data-dock-open': '' } : { inert: '' as any })}
            className="dock-drawer absolute bottom-0 inset-x-0 z-20 origin-bottom">
            <div className="dock-glass flex flex-col max-h-[min(36rem,calc(100vh-8rem))] supports-[height:100dvh]:max-h-[min(36rem,calc(100dvh-8rem))] overflow-hidden rounded-[28px]">{children}</div>
          </div>
          <div {...(open ? { inert: '' as any } : {})} className="dock-pill dock-glass relative z-10 flex h-[62px] items-center rounded-pill p-1">{pill}</div>
        </div>
        {action && <div data-dock-action="" className="shrink-0">{action}</div>}
      </div>
    </nav>
  );
}

// Item da pílula da barra inferior (ref. Iconly enviada pelo usuário, 12/11/2026): o ativo vira uma pílula branca com
// ícone e rótulo lado a lado e ocupa mais espaço; os outros mostram só o ícone (o rótulo fica para o leitor de tela).
export function DockItem({ to, icon, label, active, badge, onClick, expanded }: { to?: string; icon: IconName; label: string; active?: boolean; badge?: ReactNode; onClick?: () => void; expanded?: boolean }) {
  const cls = cx('dock-item relative flex min-w-0 items-center justify-center gap-2 h-[54px] rounded-pill [-webkit-tap-highlight-color:transparent]',
    active ? 'dock-item-ativo bg-card text-ink px-4' : 'text-ink-2 active:bg-surface-hover');
  const inner = <><span className="dock-icone relative shrink-0"><Icon name={icon} size={22} />{badge}</span>{/* tela estreita demais para o rótulo (zoom de 200%): só o ícone, o texto fica para o leitor de tela */}<span className={cx('dock-rotulo min-w-0 truncate text-[13px] leading-none font-semibold', active ? 'max-[300px]:sr-only' : 'sr-only')}>{label}</span></>;
  return to
    ? <NavLink to={to} aria-current={active ? 'page' : undefined} className={cls}>{inner}</NavLink>
    : <button type="button" onClick={onClick} aria-expanded={expanded} aria-haspopup="dialog" className={cls}>{inner}</button>;
}

// Botão de alternância explícito (equivalente ao SidebarTrigger do shadcn): preso à borda do sidebar.
export function SidebarTrigger({ className = '' }: { className?: string }) {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  return (
    <button type="button" onClick={toggleSidebar} data-slot="sidebar-trigger"
      aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!collapsed}
      title={`${collapsed ? 'Expandir' : 'Recolher'} menu (Ctrl/⌘ B)`}
      className={cx('absolute left-full top-5 -ml-px w-6 h-8 rounded-r-btn bg-card border border-l-0 border-line flex items-center justify-center text-ink-2 hover:text-ink hover:bg-surface-hover', className)}>
      <Icon name={collapsed ? 'expandir' : 'recolher'} size={16} />
    </button>
  );
}

// Faixa sensível na borda do sidebar (equivalente ao SidebarRail do shadcn): não é visível,
// só mostra uma linha fina no hover e alterna o estado num clique — o controle visível é o SidebarTrigger.
function SidebarRail() {
  const { toggleSidebar } = useSidebar();
  return (
    <button type="button" onClick={toggleSidebar} data-slot="sidebar-rail" aria-hidden="true" tabIndex={-1} title="Recolher/expandir menu"
      className="absolute inset-y-0 -right-2 z-10 hidden w-4 -translate-x-1/2 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-px hover:after:bg-line-strong sm:block" />
  );
}

export function SidebarInset({ children }: { children: ReactNode }) {
  // min-w-0: sem ele o item de flex não encolhe abaixo do conteúdo e, entre 768 e 1023 px (celular deitado, tablet em
  // pé), a página passava da borda direita pela largura da barra lateral
  return <div data-slot="sidebar-inset" className="relative flex w-full min-w-0 flex-1 flex-col">{children}</div>;
}

export function SidebarHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div data-slot="sidebar-header" className={cx('shrink-0', className)}>{children}</div>;
}

export function SidebarContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { state } = useSidebar();
  return <div data-slot="sidebar-content" data-state={state} className={cx('flex flex-col flex-1 min-h-0 group-data-[collapsible=icon]:overflow-hidden', className)}>{children}</div>;
}

export function SidebarFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div data-slot="sidebar-footer" className={cx('shrink-0', className)}>{children}</div>;
}

export function SidebarGroup({ title, children }: { title: string; children: ReactNode[] }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (!items.length) return null;
  return (
    <div data-slot="sidebar-group" className="flex flex-col gap-hair">
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      {items}
    </div>
  );
}

// "Recolhido" é só do desktop: na gaveta do celular os rótulos aparecem sempre (a barra começa recolhida desde a v2, e
// a gaveta herdava o estado e abria só com ícones)
const useMini = () => { const { state, isMobile } = useSidebar(); return state === 'collapsed' && !isMobile; };

function SidebarGroupLabel({ children }: { children: ReactNode }) {
  const mini = useMini();
  const fade = cx('transition-opacity motion-reduce:transition-none', mini ? 'opacity-0 duration-100' : 'opacity-100 duration-200 delay-100');
  return (
    <div data-slot="sidebar-group-label" className="relative h-9 shrink-0" aria-hidden="true">
      <div className={cx('absolute inset-x-3 top-1/2 h-px bg-line transition-opacity duration-200 motion-reduce:transition-none', mini ? 'opacity-100 delay-100' : 'opacity-0')} />
      <div className={cx('absolute left-3 bottom-1.5 text-caption text-ink-2 whitespace-nowrap', fade)}>{children}</div>
    </div>
  );
}

export const SidebarMenu = forwardRef<HTMLDivElement, { children: ReactNode; pill?: { top: number; height: number } | null }>(function SidebarMenu({ children, pill }, ref) {
  return (
    // recolhida, a barra de rolagem some (a lista continua rolando): ela não escala com o zoom e, nos 72px, comia a
    // largura dos itens e cortava os ícones
    <nav ref={ref} data-slot="sidebar-menu" aria-label="Módulos" className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-3 group-data-[collapsible=icon]:[scrollbar-width:none] group-data-[collapsible=icon]:[&::-webkit-scrollbar]:hidden">
      {/* item ativo: usa a cor da revenda (--brand-soft/--brand-link), com fallback automático pra grafite
         já calculado em lib/brand.ts (brandVars) quando a cor da revenda é vermelha, de baixo contraste,
         ou lembra alerta — não precisa de lógica própria aqui, só consumir as variáveis derivadas. */}
      {pill && <span aria-hidden="true" className="absolute left-3 right-3 rounded-ctl bg-brand-soft transition-[top,height] duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none" style={{ top: pill.top, height: pill.height }} />}
      {children}
    </nav>
  );
});

// `end`: só a rota exata marca o item (o de um item com subitens, para a pílula ir para o subitem). `trilha`: está numa
// tela da seção sem subitem próprio no menu (ex.: /monitoramento/alertas) — o item fica em destaque e recebe a pílula.
// Cascata: com `onToggle`, o item ganha a seta que abre/fecha os subitens. `ativo` (controlado) substitui o casamento de
// rota do NavLink — para quando os subitens são abas da mesma rota (?aba=) e só o subitem deve receber a pílula; `secao`
// pinta o item enquanto se está em qualquer tela dele.
export function SidebarMenuButton({ to, icon, label, badge, end, trilha, ativo, secao, aberto, onToggle }: { to: string; icon: IconName; label: string; badge?: ReactNode; end?: boolean; trilha?: boolean; ativo?: boolean; secao?: boolean; aberto?: boolean; onToggle?: () => void }) {
  const mini = useMini();
  const fade = cx('transition-opacity motion-reduce:transition-none', mini ? 'opacity-0 duration-100' : 'opacity-100 duration-200 delay-100');
  const cls = (on: boolean) => cx('relative z-[1] flex items-center gap-3 h-10 [@media(pointer:coarse)]:h-11 pl-[14px] rounded-ctl text-body overflow-hidden transition-colors duration-150', onToggle && !mini ? 'pr-10' : 'pr-3', on || trilha || secao ? 'font-semibold text-brand-link' : 'font-medium text-ink-2 hover:text-ink hover:bg-surface-hover');
  const gesto = (e: MouseEvent<HTMLElement>) => animarGesto(e.currentTarget, icon);
  const inner = <><Icon name={icon} className="shrink-0" /><span className={cx('truncate mr-auto', fade)}>{label}</span>{badge}</>;
  const link = ativo === undefined
    ? <NavLink to={to} end={end} onMouseEnter={gesto} data-slot="sidebar-menu-button" data-trilha={trilha || undefined} title={mini ? label : undefined} aria-label={mini ? label : undefined} className={({ isActive }) => cls(isActive)}>{inner}</NavLink>
    : <Link to={to} onMouseEnter={gesto} data-slot="sidebar-menu-button" data-trilha={trilha || undefined} title={mini ? label : undefined} aria-label={mini ? label : undefined} aria-current={ativo ? 'page' : undefined} className={cls(ativo)}>{inner}</Link>;
  if (!onToggle) return link;
  return (
    <div className="relative">
      {link}
      {!mini && (
        <button type="button" onClick={onToggle} aria-expanded={aberto} aria-label={`${aberto ? 'Fechar' : 'Abrir'} ${label}`}
          className="absolute right-1 top-1/2 z-[2] -translate-y-1/2 size-8 [@media(pointer:coarse)]:size-11 grid place-items-center rounded-ctl text-ink-3 hover:text-ink hover:bg-surface-hover">
          <Icon name="abaixo" size={16} className={cx('transition-transform duration-200 motion-reduce:transition-none', !aberto && '-rotate-90')} />
        </button>
      )}
    </div>
  );
}

// Subitem com ?aba= só fica ativo na aba dele (o NavLink ignora a query e todos ficariam ativos juntos); "?aba=" vazio é a
// aba padrão da rota. Sem query, casa a rota e as filhas dela, como o NavLink.
export function subItemAtivo(to: string, loc: { pathname: string; search: string }) {
  const u = new URL(to, 'http://x');
  if (to.includes('?')) return loc.pathname === u.pathname && (new URLSearchParams(loc.search).get('aba') || '') === (u.searchParams.get('aba') || '');
  return loc.pathname === u.pathname || loc.pathname.startsWith(u.pathname + '/');
}

// Subitens de um módulo, em cascata sob o item principal, com uma linha-guia que nasce no ícone dele. Recolhida, a barra
// só mostra ícones: o recuo e a linha somem e o subitem fica alinhado aos demais.
export function SidebarSubMenu({ items, aberto = true }: { items: { key: string; to: string; icon: IconName; label: string }[]; aberto?: boolean }) {
  const mini = useMini();
  const loc = useLocation();
  const fade = cx('transition-opacity motion-reduce:transition-none', mini ? 'opacity-0 duration-100' : 'opacity-100 duration-200 delay-100');
  if (!aberto) return null;
  return (
    <div data-slot="sidebar-sub-menu" className="relative flex flex-col gap-hair anim-fade">
      <span aria-hidden="true" className={cx('absolute left-[23px] top-0 bottom-3 w-px bg-line transition-opacity duration-150 motion-reduce:transition-none', mini && 'opacity-0')} />
      {items.map((s) => {
        const on = subItemAtivo(s.to, loc);
        return (
          <Link key={s.key} to={s.to} onMouseEnter={(e) => animarGesto(e.currentTarget, s.icon)} data-slot="sidebar-menu-button" aria-current={on ? 'page' : undefined} title={mini ? s.label : undefined} aria-label={mini ? s.label : undefined}
            className={cx('relative z-[1] flex items-center gap-3 h-9 [@media(pointer:coarse)]:h-11 pr-3 rounded-ctl text-small overflow-hidden transition-[color,background-color,padding] duration-150 motion-reduce:transition-none', mini ? 'pl-[15px]' : 'pl-[36px]', on ? 'font-semibold text-brand-link' : 'font-medium text-ink-2 hover:text-ink hover:bg-surface-hover')}>
            <Icon name={s.icon} size={18} className="shrink-0" /><span className={cx('truncate mr-auto', fade)}>{s.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
