import { Suspense, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useNeedsYou } from '../lib/needs';
import { cx, IconButton, Skeleton, confirmAction, MobileFilterCtx, Tooltip, Avatar } from './ui';
import { Icon, type IconName } from './icons';
import { OdometerAsk } from './RemoteBits';
import { useRastreioSync } from '../lib/rastreioApi';
import { lerAvatar, logout, syncFrota, syncModulos, useLocalle, useLocalleSync } from '../lib/localleApi';
import { useMaintJobs } from '../lib/maintJobs';
import NeedsPanel from './NeedsPanel';
import { canSeeFleet, endSupport, homeOf } from '../lib/support';
import { fmtT } from '@localle/shared/utils';
import CommandPalette, { isMac } from './CommandPalette';
import simboloLocalle from '../images/localle-simbolo.png';
import simbolo3d from '../images/localle-simbolo-3d.webp';
import wordmarkLocalle from '../images/localle-wordmark.webp';
import { DockItem, SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarSubMenu, SidebarProvider, useSidebar } from './Sidebar';

const OPERACAO = [
  // Início: estado geral da frota (11/11/2026); é a tela inicial de quem vê a frota (support.homeOf)
  { key: 'inicio', label: 'Início', to: '/inicio', icon: 'inicio', mod: 'monitoramento' },
  // Monitoramento é o principal; Replay e Cercas são páginas próprias, na árvore do menu (04/11/2026, eram abas)
  { key: 'monitoramento', label: 'Monitoramento', curto: 'Mapa', to: '/monitoramento', icon: 'monitoramento', sub: [
    { key: 'replay', label: 'Replay', to: '/monitoramento/replay', icon: 'rota' },
    { key: 'cercas', label: 'Cercas', to: '/monitoramento/cercas', icon: 'cerca' },
  ] },
  { key: 'relatorios', label: 'Relatórios', to: '/relatorios', icon: 'relatorios', mod: 'monitoramento' },
];
const GESTAO = [
  { key: 'ativos', label: 'Ativos', to: '/ativos', icon: 'ativos' },
  // abas da Manutenção em cascata, como no Combustível (11/11/2026)
  { key: 'manutencao', label: 'Manutenção', to: '/manutencao', icon: 'manutencao', sub: [
    { key: 'manutencao-geral', label: 'Visão geral', to: '/manutencao?aba=', icon: 'inicio' },
    { key: 'manutencao-preventivas', label: 'Preventivas', to: '/manutencao?aba=preventivas', icon: 'calendario' },
    { key: 'manutencao-os', label: 'Ordens de serviço', to: '/manutencao?aba=os', icon: 'documento' },
    { key: 'manutencao-planos', label: 'Planos', to: '/manutencao?aba=planos', icon: 'checklist' },
    { key: 'manutencao-emails', label: 'Alertas e e-mails', to: '/manutencao?aba=emails', icon: 'email' },
    { key: 'manutencao-dono', label: 'BI do dono', to: '/manutencao?aba=dono', icon: 'grafico' },
    { key: 'manutencao-gestor', label: 'BI do gestor', to: '/manutencao?aba=gestor', icon: 'tendencia' },
  ] },
  // abas do Combustível viram subitens em cascata (11/11/2026): a página fica só com o conteúdo da aba
  { key: 'combustivel', label: 'Combustível', to: '/combustivel', icon: 'combustivel', sub: [
    { key: 'combustivel-lanc', label: 'Abastecimentos', to: '/combustivel?aba=', icon: 'historico' },
    { key: 'combustivel-notas', label: 'Notas fiscais', to: '/combustivel?aba=notas', icon: 'documento' },
    { key: 'combustivel-bi', label: 'BI de abastecimento', to: '/combustivel?aba=bi', icon: 'grafico' },
    { key: 'combustivel-metas', label: 'Metas', to: '/combustivel?aba=metas', icon: 'alvo' },
  ] },
  { key: 'checklist', label: 'Checklist', to: '/checklist', icon: 'checklist' },
  { key: 'viagens', label: 'Viagens', to: '/viagens', icon: 'viagens' },
  { key: 'multas', label: 'Multas', to: '/multas', icon: 'multas' },
  { key: 'jornada', label: 'Jornada', to: '/jornada', icon: 'jornada' },
  { key: 'pneus', label: 'Pneus', to: '/pneus', icon: 'pneus' },
  { key: 'ranking', label: 'Ranking', to: '/ranking', icon: 'ranking' },
];

// Logo da revenda (white-label); sem logo cadastrada, o símbolo da Localle (src/images/localle-simbolo.png).
export function BrandMark({ size = 36 }: { size?: number }) {
  const b = useStore((s) => s.revenda.branding);
  return b.logo
    ? <img src={b.logo} alt={b.name} style={{ height: size, maxWidth: size * 4 }} className="object-contain" />
    : <img src={simboloLocalle} alt={b.name} style={{ width: size, height: size }} className="object-contain shrink-0" />;
}

// Falha de dado do backend que o usuário precisa ver sem abrir o dock: tempo real caído (posições podem estar
// paradas) e módulo que não carregou (lista vazia não pode passar por "sem dados"). O stream reconecta sozinho;
// o botão força uma recarga da frota/módulos agora.
function AvisoBackend() {
  const r = useLocalle();
  const [tentando, setTentando] = useState(false);
  const semTempoReal = r.status === 'erro';
  if (!semTempoReal && !r.modulosFalhos.length) return null;
  const tentar = async () => {
    setTentando(true);
    try { if (semTempoReal) await syncFrota(); if (r.modulosFalhos.length) await syncModulos(); } catch { /* o estado do aviso já reflete a falha */ } finally { setTentando(false); }
  };
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-stack gap-y-hair px-page md:px-page-md py-tight bg-crit-soft text-crit-ink text-small">
      <Icon name="erro" size={16} className="shrink-0" />
      <span className="mr-auto">
        {semTempoReal
          ? <><b>Sem conexão com o tempo real.</b> As posições e alertas podem estar desatualizados. {r.error}</>
          : <><b>Não foi possível carregar:</b> {r.modulosFalhos.join(', ')}. {r.error}</>}
      </span>
      <button type="button" disabled={tentando} className="h-8 px-3 rounded-btn border border-current font-medium hover:bg-card disabled:opacity-60" onClick={tentar}>{tentando ? 'Tentando…' : 'Tentar agora'}</button>
    </div>
  );
}

// Ação de criação da barra superior mobile (item 1 do plano, docs/PLANO-MOBILE.md): só existe quando a página
// chama useMobilePageAction — nas telas sem ação de criação clara, a barra fica só com o título. Registro por
// contexto (não prop) porque a barra vive no Layout, acima do Outlet; useRef guarda o onClick sempre atualizado
// sem reabrir o registro a cada render da página (só label/icon mudam o registro).
type MobileAction = { label: string; icon?: IconName; onClick: () => void };
const MobileActionCtx = createContext<{ action: MobileAction | null; set: (a: MobileAction | null) => void } | null>(null);
export function useMobilePageAction(action: MobileAction | null) {
  const ctx = useContext(MobileActionCtx);
  const ref = useRef(action); ref.current = action;
  useEffect(() => {
    if (!ctx || !action) return;
    ctx.set({ label: action.label, icon: action.icon, onClick: () => ref.current?.onClick() });
    return () => ctx.set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, action?.label, action?.icon]);
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
  // foto do avatar: buscada uma vez por sessão (undefined = ainda não buscou); a troca em Minha conta atualiza a sessão
  useEffect(() => {
    if (session.avatar !== undefined) return;
    lerAvatar(session.role === 'locale' ? 'locale' : 'gestor')
      .then((avatar) => patch((s: any) => (s.session ? { session: { ...s.session, avatar } } : {})))
      .catch((e) => console.warn('[avatar] não foi possível carregar a foto', e));
  }, [session.email]);
  const { state, isMobile, openMobile, setOpenMobile } = useSidebar();
  useMaintJobs(); // leitura diária do rastreador e escalonamento por e-mail (fila local)
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
  const [mobileAction, setMobileAction] = useState<MobileAction | null>(null);
  const [mobileFilter, setMobileFilter] = useState<{ count: number; onOpen: () => void } | null>(null);
  // título grande → compacto ao rolar (item 5, docs/PLANO-MOBILE.md): só no mobile, escreve opacity/
  // transform direto nos elementos via rAF — não é estado do React, rolar não pode disparar re-render
  // a cada pixel. Reduced motion: pula direto para o estado final (sem a transição contínua).
  const titleLgRef = useRef<HTMLHeadingElement>(null);
  const titleSmRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!isMobile) return;
    const COLLAPSE_PX = 36;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const t = reduce ? (window.scrollY > 0 ? 1 : 0) : Math.min(1, Math.max(0, window.scrollY / COLLAPSE_PX));
      const lg = titleLgRef.current, sm = titleSmRef.current;
      if (lg) { lg.style.opacity = String(1 - t); lg.style.transform = `translateY(${t * -6}px)`; }
      if (sm) { sm.style.opacity = String(t); sm.style.transform = `translateY(${(1 - t) * 6}px)`; }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [isMobile, loc.pathname]);
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
  // cascatas abertas à mão; a da seção atual abre sozinha
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  useRastreioSync();
  useLocalleSync();
  useEffect(() => { setOpenMobile(false); setHelp(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk((x) => !x); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);

  // pílula ativa: mede o link ativo e desliza até ele
  useLayoutEffect(() => {
    const measure = () => {
      const el = navRef.current?.querySelector<HTMLElement>('a[aria-current="page"]') ?? navRef.current?.querySelector<HTMLElement>('a[data-trilha]');
      // subitem fica dentro do bloco da árvore (posicionado): soma os offsets até o menu
      let top = 0;
      for (let n: HTMLElement | null = el ?? null; n && n !== navRef.current; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
      setPill(el ? { top, height: el.offsetHeight } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loc.pathname, loc.search, openMobile, session, rev.modules, abertos]);

  // revenda e Locale só veem a frota do cliente em acesso de suporte
  const fleet = canSeeFleet(session);
  const allowed = (l: typeof GESTAO) => (fleet ? l.filter((n) => rev.modules[(n as any).mod ?? n.key]) : []);
  const admin: { key: string; label: string; to: string; icon: IconName }[] = session.role !== 'locale' ? [] : [
      { key: 'locale', label: 'Visão geral', to: '/locale', icon: 'locale' },
      { key: 'locale-contratos', label: 'Contratos', to: '/locale/contratos', icon: 'dinheiro' },
      { key: 'locale-clientes', label: 'Clientes', to: '/locale/clientes', icon: 'revenda' },
      { key: 'locale-faturamento', label: 'Faturamento', to: '/locale/faturamento', icon: 'banco' },
      { key: 'locale-rastreadores', label: 'Rastreadores e chips', to: '/locale/rastreadores', icon: 'sinal' },
      { key: 'locale-juridico', label: 'Jurídico', to: '/locale/juridico', icon: 'documento' },
      { key: 'locale-saude', label: 'Saúde da plataforma', to: '/locale/saude', icon: 'monitoramento' },
      { key: 'locale-equipe', label: 'Equipe e auditoria', to: '/locale/equipe', icon: 'historico' },
  ];
  const canConfig = session.role === 'revenda' || session.role === 'locale';
  // Setup (parâmetros de operação, docs/PLANO-SETUP-ADMIN.md): quem vê a frota configura a própria empresa; a API decide quem pode alterar
  const mods = [...allowed(OPERACAO).flatMap((n: any) => [n, ...(n.sub || [])]), ...allowed(GESTAO), ...(fleet ? [{ key: 'setup', label: 'Setup', to: '/setup', icon: 'config' }, { key: 'equipe', label: 'Equipe', to: '/equipe', icon: 'equipe' }] : []), ...admin, ...(canConfig ? [{ key: 'revenda', label: 'Configurações da revenda', to: '/revenda', icon: 'marca' }] : [])];
  // celular: a barra superior diz em que tela se está (o título da página é discreto e o logo já mostra a revenda)
  const atual = mods.filter((m) => loc.pathname === m.to || loc.pathname.startsWith(m.to + '/')).sort((a, b) => b.to.length - a.to.length)[0]
    ?? (loc.pathname.startsWith('/precisa-de-voce') ? { label: 'Precisa de você' } : null);
  const mini = state === 'collapsed' && !isMobile; // só ícones (desktop recolhido); por isMobile e não por openMobile, que vira false antes da animação de saída da gaveta
  const sbw = mini ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH;
  const fade = cx('transition-opacity motion-reduce:transition-none', mini ? 'opacity-0 duration-100' : 'opacity-100 duration-200 delay-100');
  // mesma regra da tela de login: sem logo nem nome de revenda próprios, a marca é a da Localle
  const marcaLocalle = !rev.branding.logo && (!rev.branding.name || rev.branding.name === 'Localle');

  // celular: barra inferior flutuante. Três atalhos do dia a dia + "Mais" (o menu inteiro). Quem vê a frota: Início, Mapa e
  // críticos (o contador do "Precisa de você"); sem frota (revenda, Locale), as três primeiras telas.
  const naRota = (to: string) => loc.pathname === to || loc.pathname.startsWith(to + '/');
  // item com subitens = cascata: abre sozinha na seção atual, e a seta abre/fecha à mão. Subitens com ?aba= são abas da
  // própria rota do item: o item só pinta (secao) e a pílula vai para o subitem; senão o item é uma tela própria (end).
  const itemMenu = (n: any) => {
    if (!n.sub) return <SidebarMenuButton key={n.key} to={n.to} icon={n.icon} label={n.label} />;
    const abas = n.sub.some((x: any) => x.to.includes('?'));
    const aberto = abertos[n.key] ?? naRota(n.to);
    const toggle = () => setAbertos((a) => ({ ...a, [n.key]: !aberto }));
    return (
      <div key={n.key} className="flex flex-col gap-hair">
        {abas
          ? <SidebarMenuButton to={n.to} icon={n.icon} label={n.label} ativo={false} secao={naRota(n.to)} aberto={aberto} onToggle={toggle} />
          : <SidebarMenuButton to={n.to} icon={n.icon} label={n.label} end trilha={naRota(n.to) && loc.pathname !== n.to && !n.sub.some((x: any) => naRota(x.to))} aberto={aberto} onToggle={toggle} />}
        <SidebarSubMenu items={n.sub} aberto={aberto} />
      </div>
    );
  };
  const gestao = allowed(GESTAO);
  const atalhos = fleet ? allowed(OPERACAO).slice(0, 2) : mods.slice(0, 3);
  const noAtalho = atalhos.some((m) => naRota(m.to)) || (fleet && naRota('/precisa-de-voce'));
  const dockPill = <>
    {/* dock: rótulo curto quando o nome não cabe nos ~60px do item ("Monitora…") */}
    {atalhos.slice(0, 2).map((m: any) => <DockItem key={m.key} to={m.to} icon={m.icon} label={m.curto ?? m.label} active={naRota(m.to)} />)}
    {fleet && <DockItem icon="atencao" label="Críticos" active={naRota('/precisa-de-voce')} onClick={() => setPanel(true)} expanded={panel}
      badge={needs.length > 0 && <Counter n={needs.length} pulse={pulse} className="absolute -top-1.5 left-3" />} />}
    {atalhos.slice(2).map((m: any) => <DockItem key={m.key} to={m.to} icon={m.icon} label={m.curto ?? m.label} active={naRota(m.to)} />)}
    <DockItem icon="menu" label="Mais" active={!noAtalho} onClick={() => setOpenMobile(true)} expanded={openMobile} />
  </>;
  // botão redondo: Buscar com o menu fechado; Fechar com ele aberto (a pílula se recolhe e o "Mais" some)
  const dockAction = (
    <button type="button" onClick={() => (openMobile ? setOpenMobile(false) : setCmdk(true))} aria-label={openMobile ? 'Fechar menu' : 'Buscar'}
      className="dock-glass size-[62px] rounded-pill flex items-center justify-center text-ink transition-transform duration-150 active:scale-95 [-webkit-tap-highlight-color:transparent]">
      <Icon name={openMobile ? 'fechar' : 'busca'} size={22} />
    </button>
  );

  // menu recolhido: o nome some e vira dica à direita
  const footBtn = ({ icon, label, onClick, children, expanded }: { icon: IconName; label: string; onClick: () => void; children?: ReactNode; expanded?: boolean }) => (
    <Tooltip content={mini ? label : null} side="right">
    <button type="button" onClick={onClick} aria-label={mini ? label : undefined} aria-expanded={expanded}
      className="relative flex items-center gap-3 h-10 pl-[14px] pr-3 overflow-hidden rounded-ctl text-body font-medium text-ink-2 hover:text-ink hover:bg-surface-hover w-full">
      <Icon name={icon} className="shrink-0" /><span className={cx('truncate mr-auto', fade)}>{label}</span>{children}
    </button>
    </Tooltip>
  );

  return (
    <MobileActionCtx.Provider value={{ action: mobileAction, set: setMobileAction }}>
    <MobileFilterCtx.Provider value={{ slot: mobileFilter, set: setMobileFilter }}>
    <div className="flex flex-col flex-1 min-w-0 md:flex-row" style={{ ['--sb-w' as any]: `${sbw}px` }}>
      {/* primeiro Tab da página: pula o menu inteiro. HashRouter: href="#conteudo" trocaria a rota, então o clique só move o foco */}
      <a href="#conteudo" onClick={(e) => { e.preventDefault(); document.getElementById('conteudo')?.focus(); }}
        className="no-print sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[2000] focus:inline-flex focus:items-center focus:h-ctl focus:px-4 focus:rounded-ctl focus:bg-card focus:border focus:border-line focus:shadow-pop focus:text-body focus:font-medium focus:text-ink">Pular para o conteúdo</a>
      <Sidebar dock={{ pill: dockPill, action: dockAction }}>
        <SidebarHeader>
          {marcaLocalle ? (
            // Sem white-label: a logo da tela de login partida em símbolo + texto. O símbolo fica parado (é o que sobra
            // recolhida) e só o texto entra/sai com o mesmo fade dos rótulos — trocar uma imagem pela outra piscava.
            <div className="relative flex items-center gap-stack h-[72px] shrink-0 px-[18px] overflow-hidden">
              <img src={simbolo3d} alt="" aria-hidden className="w-9 h-9 object-contain shrink-0" />
              <div className={cx('flex flex-col gap-hair', isMobile ? 'flex-1 min-w-0' : 'w-[166px] shrink-0', fade)}><img src={wordmarkLocalle} alt="Localle" className="h-5 w-auto self-start" /><span className="text-caption text-ink-2 truncate">{rev.clientName}</span></div>
            </div>
          ) : (
            <div className="relative flex items-center gap-stack h-[72px] shrink-0 px-[18px] overflow-hidden">
              <BrandMark />
              <div className={cx('flex flex-col', isMobile ? 'flex-1 min-w-0' : 'w-[166px] shrink-0', fade)}><span className="font-semibold text-body leading-tight line-clamp-2">{rev.branding.name}</span><span className="text-caption text-ink-2 truncate">{rev.clientName}</span></div>
            </div>
          )}
          <div className="px-3">
            <button type="button" onClick={() => setCmdk(true)} aria-label="Buscar" className="w-full h-10 rounded-ctl bg-surface-muted flex items-center gap-stack pl-[14px] pr-2 overflow-hidden text-body text-ink-2 transition-colors duration-150 hover:text-ink hover:bg-surface-hover">
              <Icon name="busca" size={18} className="shrink-0" /><span className={cx('mr-auto whitespace-nowrap', fade)}>Buscar</span><kbd className={cx('text-caption font-mono text-ink-2 rounded-chip px-1.5 h-5 flex items-center shrink-0 bg-card border border-line max-md:hidden', fade)}>{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
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
            <SidebarGroup title="Operação">{allowed(OPERACAO).map(itemMenu)}</SidebarGroup>
            <SidebarGroup title="Gestão">{allowed(GESTAO).map(itemMenu)}</SidebarGroup>
            <SidebarGroup title="Administração">{admin.map((n) => <SidebarMenuButton key={n.key} to={n.to} icon={n.icon} label={n.label} />)}</SidebarGroup>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="px-3 pt-2 pb-3 border-t border-line flex flex-col gap-hair">
            {fleet && <NavLink to="/setup" title={mini ? 'Setup' : undefined} aria-label={mini ? 'Setup' : undefined} className={({ isActive }) => cx('flex items-center gap-3 h-10 pl-[14px] pr-3 rounded-ctl text-body font-medium overflow-hidden', isActive ? 'bg-ink text-on-dark' : 'text-ink-2 hover:text-ink hover:bg-surface-hover')}><Icon name="config" className="shrink-0" /><span className={cx('truncate', fade)}>Setup</span></NavLink>}
            {canConfig && <NavLink to="/revenda" title={mini ? 'Configurações' : undefined} aria-label={mini ? 'Configurações' : undefined} className={({ isActive }) => cx('flex items-center gap-3 h-10 pl-[14px] pr-3 rounded-ctl text-body font-medium overflow-hidden', isActive ? 'bg-ink text-on-dark' : 'text-ink-2 hover:text-ink hover:bg-surface-hover')}><Icon name="marca" className="shrink-0" /><span className={cx('truncate', fade)}>Configurações</span></NavLink>}
            <div className="relative">
              {footBtn({ icon: 'ajuda', label: 'Ajuda', onClick: () => setHelp(!help), expanded: help })}
              {help && (
                <div role="dialog" aria-label="Ajuda" className="absolute bottom-12 left-0 z-[700] w-[260px] bg-card rounded-pop p-4 shadow-pop anim-page">
                  <p className="text-small text-ink-2">Suporte {rev.branding.name}</p>
                  <p className="text-body font-medium num mt-hair">{rev.branding.supportPhone}</p>
                  {session.role === 'locale' && <NavLink to="/design" className="mt-3 inline-flex items-center gap-1 text-small text-brand-link hover:underline">Padrões visuais da plataforma<Icon name="chevron" size={14} /></NavLink>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-stack mt-2 pt-3 pl-2 overflow-hidden border-t border-line">
              <Tooltip content={mini ? session.name : null} side="right"><span className="shrink-0 inline-flex"><Avatar name={session.name} src={session.avatar} size="sm" /></span></Tooltip>
              <NavLink to="/conta" title="Minha conta" tabIndex={mini ? -1 : undefined} className={cx('flex flex-col min-w-0 mr-auto rounded-btn hover:underline', fade)}><span className="font-medium text-body truncate">{session.name}</span><span className="text-caption text-ink-2 truncate">{session.support ? 'Acesso de suporte' : session.role === 'locale' ? 'Administração Locale' : session.role === 'revenda' ? 'Admin da revenda' : 'Gestor da frota'}</span></NavLink>
              <IconButton aria-label="Configurações da conta" tip="Configurações da conta" size="sm" tone="sidebar" tabIndex={mini ? -1 : undefined} className={cx('shrink-0', fade)} onClick={() => nav('/conta')}><Icon name="config" size={18} /></IconButton>
              <IconButton aria-label="Sair" size="sm" tone="sidebar" tabIndex={mini ? -1 : undefined} className={cx('shrink-0', fade)} onClick={async () => { if (await confirmAction({ title: 'Sair do sistema?', detail: 'Você precisará entrar novamente para acessar a plataforma.', confirmLabel: 'Sair', tone: 'primary' })) { await logout(); patch(() => ({ session: null })); nav('/login'); } }}><Icon name="sair" size={18} /></IconButton>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div style={{ ['--top-reserve' as any]: reserve && !session.support ? `calc(${reserve}px + var(--gap-grid))` : '0px' }} className="flex flex-col flex-1 min-w-0">
          {/* celular: cabeçalho único, no padrão "clean e adaptável" do Visor — título grande à esquerda
              (o nome da seção já identifica a tela, dispensa repetir a logo: ela segue acessível no
              menu "Mais") e a ação de criar à direita, mesmo lugar em toda tela que tiver uma. Item 1+4
              de docs/PLANO-MOBILE.md fundidos num só cabeçalho em vez de barra pequena + título abaixo.
              O título grande esmaece/sobe e um título pequeno centralizado some/desce no lugar dele
              conforme rola (item 5) — só opacity/transform, escritos direto no DOM via rAF (useEffect
              abaixo), sem re-render do React a cada pixel de scroll. */}
          <div className="md:hidden no-print sticky top-0 z-[800] flex items-center gap-3 px-page h-16 bg-canvas overflow-hidden">
            <div className="relative flex-1 min-w-0 self-stretch">
              <h1 ref={titleLgRef} className="absolute inset-y-0 left-0 right-0 flex items-center text-h2 font-semibold truncate">{atual?.label ?? rev.branding.name}</h1>
              <span ref={titleSmRef} aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-body font-semibold truncate opacity-0 pointer-events-none">{atual?.label ?? rev.branding.name}</span>
            </div>
            {mobileFilter && (
              <button type="button" aria-label={`Filtros${mobileFilter.count ? `, ${mobileFilter.count} ativos` : ''}`} onClick={mobileFilter.onOpen}
                className="relative w-11 h-11 shrink-0 rounded-btn text-ink-2 flex items-center justify-center transition-transform duration-150 active:scale-[0.97] motion-reduce:active:scale-100 hover:text-ink hover:bg-card-2">
                <Icon name="filtro" size={20} />
                {mobileFilter.count > 0 && <span aria-hidden="true" className="absolute top-2 right-2 w-2 h-2 rounded-pill bg-brand-fill" />}
              </button>
            )}
            {mobileAction && (
              <button type="button" aria-label={mobileAction.label} onClick={mobileAction.onClick}
                className="w-11 h-11 shrink-0 rounded-btn bg-brand-fill text-brand-fill-ink flex items-center justify-center transition-transform duration-150 active:scale-[0.97] motion-reduce:active:scale-100 hover:bg-brand-fill-hover">
                <Icon name={mobileAction.icon ?? 'mais'} size={18} />
              </button>
            )}
          </div>
          {/* desktop: "Precisa de você" fica no topo à direita, na mesma linha do cabeçalho da página (que reserva a largura dele
              por --top-reserve). Com a faixa de suporte aberta, volta a ocupar uma linha própria acima dela. Não acompanha o scroll. */}
          {fleet && (
            // no Início não aparece (pedido do usuário em 11/11/2026): escondido, mede 0 e o cabeçalho deixa de reservar o espaço
            <div className={cx('no-print hidden z-[40] justify-end items-start px-page-md pointer-events-none', loc.pathname !== '/inicio' && 'md:flex', session.support ? 'pt-page-top-md bg-canvas' : 'h-0')}>
              <button ref={needsBtn} type="button" onClick={() => setPanel((x) => !x)} aria-expanded={panel} aria-haspopup="dialog" title="Precisa de você"
                className={cx('pointer-events-auto flex items-center gap-icon h-ctl px-3 rounded-ctl bg-card border border-line shadow-pop text-body font-medium text-ink-2 hover:text-ink hover:bg-surface-hover', !session.support && 'mt-page-top-md')}>
                <Icon name="atencao" className="shrink-0" /><span>Precisa de você</span>
                {needs.length > 0 && <Counter n={needs.length} pulse={pulse} className="ml-1" />}
                <span className="sr-only">{needs.length} {needs.length === 1 ? 'alerta crítico' : 'alertas críticos'}</span>
              </button>
            </div>
          )}
          {/* faixas fixas sob a barra: suporte e falha de backend empilham num contêiner só (cada uma sticky por conta
              própria parava no mesmo top e uma cobria a outra) */}
          <div className="no-print sticky max-md:top-16 md:top-14 z-[30] flex flex-col">
          {session.support && (
            <div role="status" className="flex flex-wrap items-center gap-x-stack gap-y-hair px-page md:px-page-md py-tight bg-ink text-on-dark text-small">
              <Icon name="cadeado" size={16} className="shrink-0" /><span className="mr-auto">Acesso de suporte a <b>{session.support.client}</b> desde {fmtT(session.support.at)} · {session.support.reason}</span>
              <button type="button" className="h-8 px-3 rounded-btn border border-on-dark-hover hover:bg-on-dark-hover font-medium" onClick={() => { endSupport(); nav(homeOf({ ...session, support: undefined })); }}>Encerrar acesso</button>
            </div>
          )}
          <AvisoBackend />
          </div>
          <OdometerAsk />
          <main key={loc.pathname} id="conteudo" tabIndex={-1} className="focus-visible:outline-none focus-visible:shadow-none flex-1 min-w-0 overflow-x-clip px-page pt-page-top pb-page-end max-md:pb-[calc(env(safe-area-inset-bottom,0px)+7.5rem)] md:px-page-md md:pt-page-top-md anim-page"><Suspense fallback={<div aria-busy="true" className="flex flex-col gap-grid"><Skeleton className="h-ctl w-64" /><Skeleton className="h-64 w-full" /></div>}><Outlet /></Suspense></main>
        </div>
      </SidebarInset>
      <NeedsPanel open={panel} onClose={() => setPanel(false)} anchor={needsBtn.current} />
      <CommandPalette open={cmdk} onClose={() => setCmdk(false)} modules={mods} />
    </div>
    </MobileFilterCtx.Provider>
    </MobileActionCtx.Provider>
  );
}
