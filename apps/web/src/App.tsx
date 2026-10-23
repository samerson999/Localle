import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Toaster, EmptyState, Skeleton } from './components/ui';
import { useStore } from './lib/store';
import Login from './pages/Login';
import { brandVars } from './lib/brand';

// telas carregadas sob demanda: o primeiro acesso baixa só o login e o layout (antes, um arquivo único de 1,5 MB)
const Monitoramento = lazy(() => import('./pages/Monitoramento'));
const Replay = lazy(() => import('./pages/Replay'));
const Cercas = lazy(() => import('./pages/Cercas'));
const Alertas = lazy(() => import('./pages/Alertas'));
const Relatorios = lazy(() => import('./pages/Relatorios'));
const RelatorioCercas = lazy(() => import('./pages/RelatorioCercas'));
const RelatorioVelocidade = lazy(() => import('./pages/RelatorioVelocidade'));
const RelatorioPosicoes = lazy(() => import('./pages/RelatorioPosicoes'));
const RelatorioPassouPorAqui = lazy(() => import('./pages/RelatorioPassouPorAqui'));
const Compartilhar = lazy(() => import('./pages/Compartilhar'));
const Ativos = lazy(() => import('./pages/Ativos'));
const Manutencao = lazy(() => import('./pages/Manutencao'));
const Combustivel = lazy(() => import('./pages/Combustivel'));
const Checklist = lazy(() => import('./pages/Checklist'));
const Viagens = lazy(() => import('./pages/Viagens'));
const Multas = lazy(() => import('./pages/Multas'));
const Jornada = lazy(() => import('./pages/Jornada'));
const Ranking = lazy(() => import('./pages/Ranking'));
const Revenda = lazy(() => import('./pages/Revenda'));
const Pneus = lazy(() => import('./pages/Pneus'));
const Locale = lazy(() => import('./pages/Locale'));
const Contratos = lazy(() => import('./pages/Contratos'));
const Clientes = lazy(() => import('./pages/Clientes'));
const Faturamento = lazy(() => import('./pages/Faturamento'));
const Equipe = lazy(() => import('./pages/Equipe'));
const Saude = lazy(() => import('./pages/Saude'));
const Juridico = lazy(() => import('./pages/Juridico'));
const Rastreadores = lazy(() => import('./pages/Rastreadores'));
const Design = lazy(() => import('./pages/Design'));
const PrecisaDeVoce = lazy(() => import('./pages/PrecisaDeVoce'));
const PortariaApp = lazy(() => import('./pages/PortariaApp'));
import { canSeeFleet, homeOf } from './lib/support';

function Guard({ m, children, portaria }: { m: string; children: JSX.Element; portaria?: boolean }) {
  const on = useStore((s) => s.revenda.modules[m]);
  const session = useStore((s) => s.session);
  // revenda e Locale só entram na operação do cliente pelo acesso de suporte
  if (session && !canSeeFleet(session) && !(portaria && session.role === 'portaria')) return <NoAccess title="A operação da frota é do cliente" detail="Para vê-la, use o acesso de suporte no seu painel. Cada acesso fica registrado com quem, quando e o motivo." />;
  return on ? children : <NoAccess title="Este módulo não está contratado" detail="Fale com a sua central de rastreamento para incluir o módulo no seu plano." />;
}

// sem acesso: ilustração de página (cadeado sobre pasta), nunca na cor da revenda
function NoAccess({ title, detail }: { title: string; detail: string }) {
  return <EmptyState illustration="ilu-sem-acesso" size="page" title={title} detail={detail} />;
}

// tela restrita por perfil (o link já só aparece para quem pode; isto cobre o acesso pela URL)
function RoleOnly({ roles, children }: { roles: string[]; children: JSX.Element }) {
  const role = useStore((s) => s.session?.role);
  return role && roles.includes(role) ? children : <NoAccess title="Acesso restrito a este perfil" detail="Esta tela é só para a administração da plataforma." />;
}

// enquanto a tela baixa: esqueleto do cabeçalho e de um card, no lugar exato do conteúdo (sem salto de layout)
function RouteLoading() {
  return <div aria-busy="true" className="flex flex-col gap-4 p-4 md:p-10"><Skeleton className="h-9 w-64" /><Skeleton className="h-5 w-96 max-w-full" /><Skeleton className="h-64 w-full mt-4" /></div>;
}

function Home() {
  const session = useStore((s) => s.session);
  return <Navigate to={homeOf(session)} replace />;
}

export default function App() {
  const color = useStore((s) => s.revenda.branding.color);
  const name = useStore((s) => s.revenda.branding.name);
  useEffect(() => {
    for (const [k, v] of Object.entries(brandVars(color))) document.documentElement.style.setProperty(k, v);
    document.title = name;
  }, [color, name]);
  return (
    <HashRouter>
      <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/compartilhar/:token" element={<Compartilhar />} />
        <Route path="/portaria" element={<Guard m="viagens" portaria><PortariaApp /></Guard>} />
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/precisa-de-voce" element={<PrecisaDeVoce />} />
          <Route path="/monitoramento" element={<Guard m="monitoramento"><Monitoramento /></Guard>} />
          <Route path="/monitoramento/replay" element={<Guard m="monitoramento"><Replay /></Guard>} />
          <Route path="/monitoramento/cercas" element={<Guard m="monitoramento"><Cercas /></Guard>} />
          <Route path="/monitoramento/alertas" element={<Guard m="monitoramento"><Alertas /></Guard>} />
          <Route path="/relatorios" element={<Guard m="monitoramento"><Relatorios /></Guard>} />
          <Route path="/relatorios/cercas" element={<Guard m="monitoramento"><RelatorioCercas /></Guard>} />
          <Route path="/relatorios/velocidade" element={<Guard m="monitoramento"><RelatorioVelocidade /></Guard>} />
          <Route path="/relatorios/posicoes" element={<Guard m="monitoramento"><RelatorioPosicoes /></Guard>} />
          <Route path="/relatorios/passou-por-aqui" element={<Guard m="monitoramento"><RelatorioPassouPorAqui /></Guard>} />
          <Route path="/ativos" element={<Guard m="ativos"><Ativos /></Guard>} />
          <Route path="/manutencao" element={<Guard m="manutencao"><Manutencao /></Guard>} />
          <Route path="/combustivel" element={<Guard m="combustivel"><Combustivel /></Guard>} />
          <Route path="/checklist" element={<Guard m="checklist"><Checklist /></Guard>} />
          <Route path="/viagens" element={<Guard m="viagens"><Viagens /></Guard>} />
          <Route path="/multas" element={<Guard m="multas"><Multas /></Guard>} />
          <Route path="/jornada" element={<Guard m="jornada"><Jornada /></Guard>} />
          <Route path="/ranking" element={<Guard m="ranking"><Ranking /></Guard>} />
          <Route path="/pneus" element={<Guard m="pneus"><Pneus /></Guard>} />
          <Route path="/locale" element={<Locale />} />
          <Route path="/locale/contratos" element={<RoleOnly roles={['locale']}><Contratos /></RoleOnly>} />
          <Route path="/locale/clientes" element={<RoleOnly roles={['locale']}><Clientes /></RoleOnly>} />
          <Route path="/locale/faturamento" element={<RoleOnly roles={['locale']}><Faturamento /></RoleOnly>} />
          <Route path="/locale/equipe" element={<RoleOnly roles={['locale']}><Equipe /></RoleOnly>} />
          <Route path="/locale/saude" element={<RoleOnly roles={['locale']}><Saude /></RoleOnly>} />
          <Route path="/locale/juridico" element={<RoleOnly roles={['locale']}><Juridico /></RoleOnly>} />
          <Route path="/locale/rastreadores" element={<RoleOnly roles={['locale']}><Rastreadores /></RoleOnly>} />
          <Route path="/revenda" element={<Revenda />} />
          <Route path="/design" element={<RoleOnly roles={['locale']}><Design /></RoleOnly>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <Toaster />
    </HashRouter>
  );
}
