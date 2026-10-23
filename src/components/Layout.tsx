import { Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useNeedsYou } from '../lib/needs';
import { cx, IconButton, Skeleton, confirmAction } from './ui';
import { Icon } from './icons';
import { OdometerAsk } from './RemoteBits';
import { useRastreioSync } from '../lib/rastreioApi';
import { useMaintJobs } from '../lib/maintJobs';
import NeedsPanel from './NeedsPanel';
import { canSeeFleet, endSupport, homeOf } from '../lib/support';
import { fmtT } from '../lib/utils';
import SimDock from './SimDock';
import CommandPalette, { isMac } from './CommandPalette';
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarProvider, useSidebar } from './Sidebar';

const OPERACAO = [
  { key: 'monitoramento', label: 'Monitoramento', to: '/monitoramento', icon: 'monitoramento' },
  { key: 'relatorios', label: 'Relatórios', to: '/relatorios', icon: 'relatorios', mod: 'monitoramento' },
];
const GESTAO = [
  { key: 'ativos', label: 'Ativos', to: '/ativos', icon: 'ativos' },
  { key: 'manutencao', label: 'Manutenção', to: '/manutencao', icon: 'manutencao' },
  { key: 'combustivel', label: 'Combustível', to: '/combustivel', icon: 'combustivel' },
  { key: 'checklist', label: 'Checklist', to: '/checklist', icon: 'checklist' },
  { key: 'viagens', label: 'Viagens', to: '/viagens', icon: 'viagens' },
  { key: 'multas', label: 'Multas', to: '/multas', icon: 'multas' },
  { key: 'jornada', label: 'Jornada', to: '/jornada', icon: 'jornada' },
  { key: 'pneus', label: 'Pneus', to: '/pneus', icon: 'pneus' },
  { key: 'ranking', label: 'Ranking', to: '/ranking', icon: 'ranking' },
];

export function BrandMark({ size = 36 }: { size?: number }) {
  const b = useStore((s) => s.revenda.branding);
  return b.logo
    ? <img src={b.logo} alt={b.name} style={{ height: size, maxWidth: size * 4 }} className="object-contain" />
    : <div style={{ width: size, height: size }} className="rounded-btn bg-brand text-brand-ink flex items-center justify-center font-semibold text-small shrink-0">{b.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}</div>;
}

function Counter({ n, pulse = 0, className = '' }: { n: number; pulse?: number; className?: string }) {
  // key = pulse: remonta e toca o pulso uma vez a cada item crítico novo
  return <span key={pulse} className={cx(pulse > 0 && 'pulse-once', 'min-w-[20px] h-5 px-2 rounded-pill bg-crit text-on-dark text-caption font-semibold flex items-center justify-center num', className)} aria-hidden="true">{n > 99 ? '99+' : n}</span>;
}

export default function Layout() {
  const nav = useNavigate();
  const session = useStore((s) => s.session);
  useEffect(() => { if (!session) nav('/login'); else if (session.role === 'portaria') nav('/portaria', { replace: true }); }, [session]);
  if (!session || session.role === 'portaria') return null;
  return (
    <SidebarProvider>
      <LayoutBody />
    </SidebarProvider>
  );
}

function LayoutBody() {
  const nav = useNavigate();
  const loc = useLocation();
  const session = useStore((s) => s.session)!;
  const rev = useStore((s) => s.revenda);
  const patch = useStore((s) => s.patch);
  const needs = useNeedsYou();
  const { state, openMobile, setOpenMobile } = useSidebar();
  useMaintJobs(); // leitura diária do rastreador e escalonamento por e-mail (demo)
  // pulso no contador só quando entra um item crítico novo (não quando sai um, nem a cada atualização)
  const seen = useRef<Set<string> | null>(null);
  const [pulse, setPulse] = useState(0);
  const needIds = needs.map((n: any) => n.id).join('|');
  useEffect(() => {
    const ids = needIds ? needIds.split('|') : [];
    if (seen.current && ids.some((id) => !seen.current!.has(id))) setPulse((p) => p + 1);
    seen.current = new Set(ids);
  }, [needIds]);
  const [panel, setPanel] = useState(false);
  // largura do botão flutuante "Precisa de você": o cabeçalho da página reserva esse espaço à direita (--top-reserve)
  // para ficar na mesma linha dele sem ser coberto
  const needsBtn = useRef<HTMLButtonElement>(null);
  const [reserve, setReserve] = useState(0);
  useLayoutEffect(() => {
    const el = needsBtn.current;
    if (!el) { setReserve(0); return; }
    const ro = new ResizeObserver(() => setReserve(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const [cmdk, setCmdk] = useState(false);
  const [help, setHelp] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => { const t = setInterval(() => useStore.getState().tick(2000), 2000); return () => clearInterval(t); }, []);
  useRastreioSync();
  useEffect(() => { setOpenMobile(false); setHelp(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk((x) => !x); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);

  // pílula ativa: mede o link ativo e desliza até ele
  useLayoutEffect(() => {
    const measure = () => {
      const el = navRef.current?.querySelector<HTMLElement>('a[aria-current="page"]');
      setPill(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loc.pathname, openMobile, session, rev.modules]);

  // revenda e Locale só veem a frota do cliente em acesso de suporte
  const fleet = canSeeFleet(session);
  const allowed = (l: typeof GESTAO) => (fleet ? l.filter((n) => rev.modules[(n as any).mod ?? n.key]) : []);
  const admin = [
    ...(session.role === 'locale' ? [
      { key: 'locale', label: 'Visão geral', to: '/locale', icon: 'locale' },
      { key: 'locale-planos', label: 'Planos', to: '/locale/planos', icon: 'dinheiro' },
      { key: 'locale-clientes', label: 'Clientes', to: '/locale/clientes', icon: 'revenda' },
      { key: 'locale-faturamento', label: 'Faturamento', to: '/locale/faturamento', icon: 'banco' },
      { key: 'locale-rastreadores', label: 'Rastreadores e chips', to: '/locale/rastreadores', icon: 'sinal' },
      { key: 'locale-juridico', label: 'Jurídico', to: '/locale/juridico', icon: 'documento' },
      { key: 'locale-saude', label: 'Saúde da plataforma', to: '/locale/saude', icon: 'monitoramento' },
      { key: 'locale-equipe', label: 'Equipe e auditoria', to: '/locale/equipe', icon: 'historico' },
    ] : []),
  ];
  const canConfig = session.role === 'revenda' || session.role === 'locale';
  const mods = [...allowed(OPERACAO), ...allowed(GESTAO), ...admin, ...(canConfig ? [{ key: 'revenda', label: 'Configurações da revenda', to: '/revenda', icon: 'config' }] : [])];
  const mini = state === 'collapsed' && !openMobile; // só ícones (desktop recolhido)
  const sbw = mini ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH;
  const fade = cx('transition-opacity motion-reduce:transition-none', mini ? 'opacity-0 duration-100' : 'opacity-100 duration-200 delay-100');

  const footBtn = ({ icon, label, onClick, children, expanded }: { icon: string; label: string; onClick: () => void; children?: ReactNode; expanded?: boolean }) => (
    <button type="button" onClick={onClick} title={mini ? label : undefined} aria-label={mini ? label : undefined} aria-expanded={expanded}
      className="relative flex items-center gap-3 h-10 pl-[14px] pr-3 overflow-hidden rounded-ctl text-body font-medium text-ink-2 hover:text-ink hover:bg-surface-hover w-full">
      <Icon name={icon} className="shrink-0" /><span className={cx('truncate mr-auto', fade)}>{label}</span>{children}
    </button>
  );

  return (
    <div className="flex flex-col flex-1 min-w-0 md:flex-row" style={{ ['--sb-w' as any]: `${sbw}px` }}>
      <Sidebar>
        <SidebarHeader>
          <div className={cx('relative flex items-center gap-stack h-[72px] shrink-0 px-[18px] overflow-hidden', openMobile && 'pr-14')}>
            <BrandMark />
            <div className={cx('flex flex-col', openMobile ? 'flex-1 min-w-0' : 'w-[166px] shrink-0', fade)}><span className="font-semibold text-body leading-tight line-clamp-2">{rev.branding.name}</span><span className="text-caption text-ink-2 truncate">{rev.clientName}</span></div>
            {openMobile && <IconButton tone="sidebar" size="sm" onClick={() => setOpenMobile(false)} aria-label="Fechar menu" className="absolute right-3 top-1/2 -translate-y-1/2"><Icon name="fechar" size={18} /></IconButton>}
          </div>
          <div className="px-3">
            <button type="button" onClick={() => setCmdk(true)} aria-label="Buscar" className="w-full h-10 rounded-ctl bg-surface-muted flex items-center gap-stack pl-[14px] pr-2 overflow-hidden text-body text-ink-2 transition-colors duration-150 hover:text-ink hover:bg-surface-hover">
              <Icon name="busca" size={18} className="shrink-0" /><span className={cx('mr-auto whitespace-nowrap', fade)}>Buscar</span><kbd className={cx('text-caption font-mono text-ink-2 rounded-chip px-1.5 h-5 flex items-center shrink-0 bg-card border border-line', fade)}>{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
            </button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu ref={navRef} pill={pill}>
            {fleet && (
              <div className="flex flex-col gap-hair mb-2">
                <SidebarMenuButton to="/precisa-de-voce" icon="atencao" label="Precisa de você" badge={needs.length > 0 && <Counter n={needs.length} pulse={pulse} className={cx('shrink-0', fade)} />} />
              </div>
            )}
            <SidebarGroup title="Operação">{allowed(OPERACAO).map((n) => <SidebarMenuButton key={n.key} to={n.to} icon={n.icon} label={n.label} />)}</SidebarGroup>
            <SidebarGroup title="Gestão">{allowed(GESTAO).map((n) => <SidebarMenuButton key={n.key} to={n.to} icon={n.icon} label={n.label} />)}</SidebarGroup>
            <SidebarGroup title="Administração">{admin.map((n) => <SidebarMenuButton key={n.key} to={n.to} icon={n.icon} label={n.label} />)}</SidebarGroup>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-3 pt-2 pb-3 border-t border-line flex flex-col gap-hair">
            {canConfig && <NavLink to="/revenda" title={mini ? 'Configurações' : undefined} aria-label={mini ? 'Configurações' : undefined} className={({ isActive }) => cx('flex items-center gap-3 h-10 pl-[14px] pr-3 rounded-ctl text-body font-medium overflow-hidden', isActive ? 'bg-ink text-on-dark' : 'text-ink-2 hover:text-ink hover:bg-surface-hover')}><Icon name="config" className="shrink-0" /><span className={cx('truncate', fade)}>Configurações</span></NavLink>}
            <div className="relative">
              {footBtn({ icon: 'ajuda', label: 'Ajuda', onClick: () => setHelp(!help), expanded: help })}
              {help && (
                <div role="dialog" aria-label="Ajuda" className="absolute bottom-12 left-0 z-[700] w-[260px] bg-card border border-line rounded-pop p-4 shadow-pop anim-page">
                  <p className="text-small text-ink-2">Suporte {rev.branding.name}</p>
                  <p className="text-body font-medium num mt-hair">{rev.branding.supportPhone}</p>
                  {session.role === 'locale' && <NavLink to="/design" className="mt-3 inline-flex items-center gap-1 text-small text-brand-link hover:underline">Padrões visuais da plataforma<Icon name="chevron" size={14} /></NavLink>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-stack mt-2 pt-3 pl-2 overflow-hidden border-t border-line">
              <div className="w-8 h-8 rounded-pill bg-avatar text-ink flex items-center justify-center font-semibold text-caption shrink-0" title={mini ? session.name : undefined}>{session.name.slice(0, 2).toUpperCase()}</div>
              <div className={cx('flex flex-col min-w-0 mr-auto', fade)}><span className="font-medium text-body truncate">{session.name}</span><span className="text-caption text-ink-2 truncate">{session.support ? 'Acesso de suporte' : session.role === 'locale' ? 'Administração Locale' : session.role === 'revenda' ? 'Admin da revenda' : 'Gestor da frota'}</span></div>
              <IconButton aria-label="Sair" title="Sair" size="sm" tone="sidebar" tabIndex={mini ? -1 : undefined} className={cx('shrink-0', fade)} onClick={async () => { if (await confirmAction({ title: 'Sair do sistema?', detail: 'Você precisará entrar novamente para acessar a plataforma.' })) { patch(() => ({ session: null })); nav('/login'); } }}><Icon name="sair" size={18} /></IconButton>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div style={{ ['--top-reserve' as any]: reserve && !session.support ? `calc(${reserve}px + var(--gap-grid))` : '0px' }} className="flex flex-col flex-1 min-w-0">
          {/* celular: barra superior com contador sempre visível */}
          <div className="md:hidden no-print sticky top-0 z-[800] flex items-center gap-2 px-4 h-14 bg-canvas border-b border-line">
            <BrandMark size={30} /><span className="font-semibold text-body truncate mr-auto">{rev.branding.name}</span>
            <IconButton size="touch" onClick={() => setCmdk(true)} aria-label="Buscar" ><Icon name="busca" /></IconButton>
            {fleet && <IconButton size="touch" onClick={() => setPanel(true)} aria-label={`Precisa de você: ${needs.length} críticos`} className="relative"><Icon name="atencao" />{needs.length > 0 && <Counter n={needs.length} pulse={pulse} className="absolute top-0.5 right-0" />}</IconButton>}
            <IconButton size="touch" onClick={() => setOpenMobile(true)} aria-label="Abrir menu" aria-expanded={openMobile} ><Icon name="menu" /></IconButton>
          </div>
          {/* desktop: "Precisa de você" fica no topo à direita, na mesma linha do cabeçalho da página (que reserva a largura dele
              por --top-reserve). Com a faixa de suporte aberta, volta a ocupar uma linha própria acima dela. Não acompanha o scroll. */}
          {fleet && (
            <div className={cx('no-print hidden md:flex z-[40] justify-end items-start px-page-md pointer-events-none', session.support ? 'pt-page-top-md bg-canvas' : 'h-0')}>
              <button ref={needsBtn} type="button" onClick={() => setPanel(true)} aria-expanded={panel} title="Precisa de você"
                className={cx('pointer-events-auto flex items-center gap-icon h-ctl px-3 rounded-ctl bg-card border border-line shadow-pop text-body font-medium text-ink-2 hover:text-ink hover:bg-surface-hover', !session.support && 'mt-page-top-md')}>
                <Icon name="atencao" className="shrink-0" /><span>Precisa de você</span>
                {needs.length > 0 && <Counter n={needs.length} pulse={pulse} className="ml-1" />}
                <span className="sr-only">{needs.length} {needs.length === 1 ? 'alerta crítico' : 'alertas críticos'}</span>
              </button>
            </div>
          )}
          {session.support && (
            <div role="status" className="no-print sticky top-14 md:top-14 z-[30] flex flex-wrap items-center gap-x-stack gap-y-hair px-page md:px-page-md py-tight bg-ink text-on-dark text-small">
              <Icon name="cadeado" size={16} className="shrink-0" /><span className="mr-auto">Acesso de suporte a <b>{session.support.client}</b> desde {fmtT(session.support.at)} · {session.support.reason}</span>
              <button type="button" className="h-8 px-3 rounded-btn border border-on-dark-hover hover:bg-on-dark-hover font-medium" onClick={() => { endSupport(); nav(homeOf({ ...session, support: undefined })); }}>Encerrar acesso</button>
            </div>
          )}
          <OdometerAsk />
          <main key={loc.pathname} className="flex-1 min-w-0 overflow-x-clip px-page pt-page-top pb-page-end md:px-page-md md:pt-page-top-md anim-page"><Suspense fallback={<div aria-busy="true" className="flex flex-col gap-grid"><Skeleton className="h-ctl w-64" /><Skeleton className="h-64 w-full" /></div>}><Outlet /></Suspense></main>
        </div>
      </SidebarInset>
      <NeedsPanel open={panel} onClose={() => setPanel(false)} />
      <CommandPalette open={cmdk} onClose={() => setCmdk(false)} modules={mods} />
      <SimDock />
    </div>
  );
}
