import { createContext, forwardRef, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cx, useScrollLock } from './ui';
import { Icon } from './icons';

// Porte do Sidebar oficial do shadcn/ui (https://ui.shadcn.com/docs/components/base/sidebar)
// para Tailwind v3 e sem radix-ui/cva/lucide: mesma API e os mesmos data-attributes de estado
// (data-state, data-collapsible, data-side), reimplementados sobre nosso design system próprio
// (tokens.css) em vez do tema de cores deles. Larguras e cores seguem as nossas (72/248px).

export const SIDEBAR_WIDTH = 248;
const SIDEBAR_WIDTH_MOBILE = 280;
export const SIDEBAR_WIDTH_ICON = 72;
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';
const SIDEBAR_STORAGE_KEY = 'ui.sidebar.collapsed';

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

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < breakpoint);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [breakpoint]);
  return isMobile;
}

const readStoredOpen = () => { try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== '1'; } catch { return true; } };

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

export function Sidebar({ collapsible = 'icon', children }: { collapsible?: 'icon' | 'none'; children: ReactNode }) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === 'none') {
    return <div data-slot="sidebar" className="flex h-full flex-col bg-card text-ink" style={{ width: SIDEBAR_WIDTH }}>{children}</div>;
  }

  if (isMobile) {
    return (
      <SidebarSheet open={openMobile} onClose={() => setOpenMobile(false)}>{children}</SidebarSheet>
    );
  }

  return (
    <div className="group hidden md:block" data-state={state} data-collapsible={state === 'collapsed' ? collapsible : ''} data-side="left" data-slot="sidebar">
      <div data-slot="sidebar-gap" className="relative shrink-0 bg-transparent transition-[width] duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ width: state === 'collapsed' ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH }} />
      <div data-slot="sidebar-container" className="fixed inset-y-0 left-0 z-20 hidden h-screen transition-[width] duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:flex"
        style={{ width: state === 'collapsed' ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH }}
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
  return <div data-slot="sidebar-inset" className="relative flex w-full flex-1 flex-col">{children}</div>;
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

function SidebarGroupLabel({ children }: { children: ReactNode }) {
  const { state } = useSidebar();
  const mini = state === 'collapsed';
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
    <nav ref={ref} data-slot="sidebar-menu" aria-label="Módulos" className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 pt-3 pb-3">
      {/* item ativo: usa a cor da revenda (--brand-soft/--brand-link), com fallback automático pra grafite
         já calculado em lib/brand.ts (brandVars) quando a cor da revenda é vermelha, de baixo contraste,
         ou lembra alerta — não precisa de lógica própria aqui, só consumir as variáveis derivadas. */}
      {pill && <span aria-hidden="true" className="absolute left-3 right-3 rounded-ctl bg-brand-soft transition-[top,height] duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none" style={{ top: pill.top, height: pill.height }} />}
      {children}
    </nav>
  );
});

export function SidebarMenuButton({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: ReactNode }) {
  const { state } = useSidebar();
  const mini = state === 'collapsed';
  const fade = cx('transition-opacity motion-reduce:transition-none', mini ? 'opacity-0 duration-100' : 'opacity-100 duration-200 delay-100');
  return (
    <NavLink to={to} data-slot="sidebar-menu-button" title={mini ? label : undefined} aria-label={mini ? label : undefined}
      className={({ isActive }) => cx('relative z-[1] flex items-center gap-3 h-10 pl-[14px] pr-3 rounded-ctl text-body overflow-hidden transition-colors duration-150', isActive ? 'font-semibold text-brand-link' : 'font-medium text-ink-2 hover:text-ink hover:bg-surface-hover')}>
      <Icon name={icon} className="shrink-0" /><span className={cx('truncate mr-auto', fade)}>{label}</span>{badge}
    </NavLink>
  );
}
