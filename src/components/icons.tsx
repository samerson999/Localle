import type { ComponentType, SVGProps } from 'react';

// Ícones da sidebar: Solar Icons (480 Design, CC BY 4.0), variante "Bold Duotone" —
// mesmo conjunto usado pelo Visor (dashboard.visorfinance.app), fill duotone em vez de
// traço. Resolvidos em build-time pelo unplugin-icons (vite.config.ts).
import SolarMonitoramento from '~icons/solar/map-point-wave-bold-duotone';
import SolarRelatorios from '~icons/solar/document-text-bold-duotone';
import SolarAtivos from '~icons/solar/delivery-bold-duotone';
import SolarManutencao from '~icons/solar/toolbox-bold-duotone';
import SolarCombustivel from '~icons/solar/gas-station-bold-duotone';
import SolarChecklist from '~icons/solar/checklist-bold-duotone';
import SolarViagens from '~icons/solar/route-bold-duotone';
import SolarMultas from '~icons/solar/ticket-bold-duotone';
import SolarJornada from '~icons/solar/clock-circle-bold-duotone';
import SolarPneus from '~icons/solar/wheel-bold-duotone';
import SolarRanking from '~icons/solar/cup-first-bold-duotone';
import SolarLocale from '~icons/solar/buildings-2-bold-duotone';
import SolarConfig from '~icons/solar/settings-minimalistic-bold-duotone';
import SolarAtencao from '~icons/solar/danger-triangle-bold-duotone';
import SolarAjuda from '~icons/solar/question-circle-bold-duotone';
import SolarSair from '~icons/solar/logout-2-bold-duotone';
import SolarExpandir from '~icons/solar/alt-arrow-right-bold-duotone';
import SolarRecolher from '~icons/solar/alt-arrow-left-bold-duotone';

const SOLAR: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  monitoramento: SolarMonitoramento,
  relatorios: SolarRelatorios,
  ativos: SolarAtivos,
  manutencao: SolarManutencao,
  combustivel: SolarCombustivel,
  checklist: SolarChecklist,
  viagens: SolarViagens,
  multas: SolarMultas,
  jornada: SolarJornada,
  pneus: SolarPneus,
  ranking: SolarRanking,
  locale: SolarLocale,
  config: SolarConfig,
  atencao: SolarAtencao,
  ajuda: SolarAjuda,
  sair: SolarSair,
  expandir: SolarExpandir,
  recolher: SolarRecolher,
};

// Conjunto de ícones da plataforma: grade de 24px, traço 1,5px, sem preenchimento, sem fundo.
const P: Record<string, string> = {
  // módulos
  monitoramento: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z M12 12.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z',
  ativos: 'M2.75 16.25V7.75h11v8.5 M13.75 10.25h4l3.5 3.5v2.5h-1.5 M2.75 16.25h1.5 M9.25 16.25h6 M6.75 18.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.75 18.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  manutencao: 'M14.5 4.5a4.25 4.25 0 0 0-5.3 5.3L3.75 15.25a1.77 1.77 0 0 0 2.5 2.5l5.45-5.45a4.25 4.25 0 0 0 5.3-5.3l-2.55 2.55-2.25-.25-.25-2.25z',
  combustivel: 'M4.75 20.25V5.25a1.5 1.5 0 0 1 1.5-1.5h6.5a1.5 1.5 0 0 1 1.5 1.5v15 M3.25 20.25h12.5 M7.25 7.75h4 M14.25 9.25h1.75a1.5 1.5 0 0 1 1.5 1.5v5.5a1.25 1.25 0 0 0 2.5 0V8.5l-2.75-2.75',
  checklist: 'M8.75 4.25h-2.5a1.5 1.5 0 0 0-1.5 1.5v13.5a1.5 1.5 0 0 0 1.5 1.5h11.5a1.5 1.5 0 0 0 1.5-1.5V5.75a1.5 1.5 0 0 0-1.5-1.5h-2.5 M8.75 3.25h6.5v2.5h-6.5z M8.75 13.25l2.25 2.25 4.25-4.5',
  viagens: 'M6.25 20.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.75 7.75a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8.25 18.25h7a3.25 3.25 0 0 0 0-6.5h-6.5a3.25 3.25 0 0 1 0-6.5h7',
  multas: 'M6.25 3.75h11.5v16.5l-2.25-1.5-2 1.5-1.5-1.25-1.5 1.25-2-1.5-2.25 1.5z M9.25 8.25h5.5 M9.25 11.75h5.5 M9.25 15.25h3',
  jornada: 'M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5z M12 7.75V12l2.75 1.75',
  pneus: 'M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 3.75V6 M12 18v2.25 M3.75 12H6 M18 12h2.25 M6.15 6.15l1.6 1.6 M16.25 16.25l1.6 1.6 M6.15 17.85l1.6-1.6 M16.25 7.75l1.6-1.6',
  ranking: 'M3.75 20.25h16.5 M9.25 20.25v-11h5.5v11 M4.25 20.25v-6.5h5 M14.75 20.25v-4.5h5v4.5 M12 3.75l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z',
  revenda: 'M3.75 20.25h16.5 M5.25 20.25V9.5L12 4.25l6.75 5.25v10.75 M9.75 20.25v-5.5h4.5v5.5',
  locale: 'M4.25 4.25h15.5v15.5H4.25z M4.25 9.25h15.5 M9.25 19.75v-10.5',
  design: 'M4.25 4.25h6.5v6.5h-6.5z M13.25 4.25h6.5v6.5h-6.5z M4.25 13.25h6.5v6.5h-6.5z M16.5 13.25v6.5 M13.25 16.5h6.5',
  relatorios: 'M7.25 3.75h9.5l3 3v13.5a1 1 0 0 1-1 1h-11.5a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1z M16.25 3.75v3h3 M8.75 13.25v4.5 M12 10.75v7 M15.25 14.75v3',
  // shell
  busca: 'M10.75 17.25a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5l4.75 4.75',
  atencao: 'M5.75 16.75V11a6.25 6.25 0 0 1 12.5 0v5.75l1.5 1.5H4.25z M10 20.75h4',
  config: 'M4.25 7.25h9.5 M17.75 7.25h2 M4.25 16.75h2 M10.25 16.75h9.5 M15.75 9.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8.25 18.75a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  ajuda: 'M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5z M9.75 9.5a2.3 2.3 0 0 1 4.45.75c0 1.5-2.2 2-2.2 3.25 M12 16.75v.01',
  sair: 'M14.25 4.25h3.5a1.5 1.5 0 0 1 1.5 1.5v12.5a1.5 1.5 0 0 1-1.5 1.5h-3.5 M10.25 8l-4 4 4 4 M6.25 12h9',
  recolher: 'M4.25 4.25h15.5v15.5H4.25z M9.25 4.25v15.5 M15.25 9.5L12.75 12l2.5 2.5',
  expandir: 'M4.25 4.25h15.5v15.5H4.25z M9.25 4.25v15.5 M12.75 9.5l2.5 2.5-2.5 2.5',
  menu: 'M4.25 7.25h15.5 M4.25 12h15.5 M4.25 16.75h15.5',
  fechar: 'M6.25 6.25l11.5 11.5 M17.75 6.25L6.25 17.75',
  chevron: 'M9.75 6.25L15.5 12l-5.75 5.75',
  voltar: 'M14.25 6.25L8.5 12l5.75 5.75',
  abaixo: 'M6.25 9.75L12 15.5l5.75-5.75',
  mais: 'M12 5.25v13.5 M5.25 12h13.5',
  play: 'M7.75 5.25v13.5L18.75 12z',
  pause: 'M8.25 5.75v12.5 M15.75 5.75v12.5',
  reiniciar: 'M4.75 12a7.25 7.25 0 1 0 2.1-5.1 M4.75 4.75v4.5h4.5',
  filtro: 'M4.25 5.75h15.5 M7.25 12h9.5 M10.25 18.25h3.5',
  exportar: 'M12 3.75v11 M7.75 10.5L12 14.75l4.25-4.25 M4.75 15.25v3.5a1.5 1.5 0 0 0 1.5 1.5h11.5a1.5 1.5 0 0 0 1.5-1.5v-3.5',
  calendario: 'M4.75 6.25h14.5v13.5H4.75z M4.75 10.25h14.5 M8.25 3.75v4 M15.75 3.75v4',
  externo: 'M8.25 15.75l7.5-7.5 M9.75 8.25h6v6',
  banco: 'M12 9.25c4.14 0 7.25-1.23 7.25-2.75S16.14 3.75 12 3.75 4.75 4.98 4.75 6.5 7.86 9.25 12 9.25z M4.75 6.5v11c0 1.52 3.11 2.75 7.25 2.75s7.25-1.23 7.25-2.75v-11 M4.75 12c0 1.52 3.11 2.75 7.25 2.75s7.25-1.23 7.25-2.75',
  sinal: 'M5.25 18.25v-2 M9.75 18.25v-5 M14.25 18.25v-8 M18.75 18.25v-11',
  alerta: 'M12 4.25l8.5 15H3.5z M12 10.25v4 M12 16.75v.01',
  ok: 'M5.25 12.5l4.25 4.25 9.25-9.5',
  relogio: 'M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5z M12 7.75V12h3.5',
  dinheiro: 'M3.75 6.75h16.5v10.5H3.75z M12 14.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z M6.75 9.75v4.5 M17.25 9.75v4.5',
  cadeado: 'M6.25 10.75h11.5v9H6.25z M8.75 10.75V8a3.25 3.25 0 0 1 6.5 0v2.75',
  camera: 'M3.75 7.75h3.5l1.5-2.5h6.5l1.5 2.5h3.5v11H3.75z M12 15.75a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  rota: 'M4.75 19.25c3-6 11.5-2.5 14.5-9.5 M16.25 4.75h3.5v3.5 M19.75 4.75l-.5 5',
  comando: 'M5.25 7.75l4.25 4.25-4.25 4.25 M11.75 17.25h7',
  // ações
  'mais-opcoes': 'M6 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M18 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  editar: 'M14.75 5.75l3.5 3.5 M4.75 19.25l.75-4.25L15.25 5.25a1.41 1.41 0 0 1 2 0l1.5 1.5a1.41 1.41 0 0 1 0 2L9 18.5z',
  excluir: 'M4.75 7.25h14.5 M9.25 7.25v-2h5.5v2 M6.75 7.25l.75 12.5h9l.75-12.5 M10.25 11v5.25 M13.75 11v5.25',
  visualizar: 'M2.75 12s3.5-6.25 9.25-6.25S21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z M12 14.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5z',
  duplicar: 'M8.75 8.75h10.5v10.5H8.75z M15.25 8.75v-4H4.75v10.5h4',
  historico: 'M4.75 12a7.25 7.25 0 1 0 2.1-5.1 M4.75 4.75v4.5h4.5 M12 8.25V12l2.5 1.75',
  importar: 'M12 14.75v-11 M7.75 8L12 3.75 16.25 8 M4.75 15.25v3.5a1.5 1.5 0 0 0 1.5 1.5h11.5a1.5 1.5 0 0 0 1.5-1.5v-3.5',
  imprimir: 'M7.25 9.25v-5h9.5v5 M7.25 16.75h-2.5v-7.5h14.5v7.5h-2.5 M7.25 13.75h9.5v6h-9.5z',
  compartilhar: 'M17.25 8.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z M6.75 14.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z M17.25 20.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z M8.75 11l6.5-3.75 M8.75 13l6.5 3.75',
  enviar: 'M20.25 3.75L10.5 13.5 M20.25 3.75l-6 16.5-3.75-6.75-6.75-3.75z',
  link: 'M10.25 13.75a3.75 3.75 0 0 0 5.3 0l3-3a3.75 3.75 0 0 0-5.3-5.3l-1.25 1.25 M13.75 10.25a3.75 3.75 0 0 0-5.3 0l-3 3a3.75 3.75 0 0 0 5.3 5.3l1.25-1.25',
  anexo: 'M19 11.5l-7.25 7.25a4.6 4.6 0 0 1-6.5-6.5l7.5-7.5a3 3 0 0 1 4.25 4.25l-7.25 7.25a1.4 1.4 0 0 1-2-2l6.75-6.75',
  ordenar: 'M8 4.75v14.5 M4.75 8L8 4.75 11.25 8 M16 19.25V4.75 M12.75 16L16 19.25 19.25 16',
  // comunicação e feedback
  info: 'M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5z M12 11v5.25 M12 7.75v.01',
  sucesso: 'M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5z M8.5 12.25l2.5 2.5 4.75-5',
  erro: 'M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5z M9.25 9.25l5.5 5.5 M14.75 9.25l-5.5 5.5',
  mensagem: 'M4.25 5.25h15.5v11h-9l-4.5 3.5v-3.5h-2z M8.25 9.25h7.5 M8.25 12.25h4.5',
  email: 'M3.75 6.25h16.5v11.5H3.75z M3.75 6.75L12 13l8.25-6.25',
  documento: 'M6.25 3.75h7.5l4 4v12.5H6.25z M13.75 3.75v4h4 M9 12.25h6 M9 15.75h6',
  // pessoas e gestão
  usuario: 'M12 11.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z M4.75 20.25a7.25 7.25 0 0 1 14.5 0',
  equipe: 'M9 11.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5z M2.75 19.75a6.25 6.25 0 0 1 12.5 0 M15.75 4.9a3.25 3.25 0 0 1 0 6.2 M17.75 13.6a6.25 6.25 0 0 1 3.5 6.15',
  escudo: 'M12 3.75l7.25 2.75v5.25c0 4.25-3 7.5-7.25 8.75-4.25-1.25-7.25-4.5-7.25-8.75V6.5z M8.75 12l2.25 2.25 4.25-4.5',
  trofeu: 'M7.75 4.25h8.5v5a4.25 4.25 0 0 1-8.5 0z M7.75 6.25h-3a3 3 0 0 0 3 4 M16.25 6.25h3a3 3 0 0 1-3 4 M12 13.5v3.5 M8.25 19.75h7.5 M9.25 17h5.5v2.75',
  // condução e telemetria
  velocimetro: 'M4.5 17.25a8.25 8.25 0 1 1 15 0 M12 13.75l3.75-4 M6.75 12.25h1 M16.25 12.25h1 M12 7.25v1',
  odometro: 'M3.75 8.25h16.5v7.5H3.75z M8 8.25v7.5 M12 8.25v7.5 M16 8.25v7.5',
  bateria: 'M3.75 7.75h14.5v8.5H3.75z M20.25 10.5v3 M7 10.5v3 M10.25 10.5v3',
  temperatura: 'M10 14.6V5.25a2 2 0 0 1 4 0v9.35a3.75 3.75 0 1 1-4 0z M12 9.25v6.5',
  online: 'M3.75 9.25a12 12 0 0 1 16.5 0 M6.75 12.5a7.5 7.5 0 0 1 10.5 0 M9.75 15.75a3 3 0 0 1 4.5 0 M12 19.25v.01',
  // mapa
  centralizar: 'M12 18.75a6.75 6.75 0 1 0 0-13.5 6.75 6.75 0 0 0 0 13.5z M12 2.75v3 M12 18.25v3 M2.75 12h3 M18.25 12h3 M12 13.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z',
  camadas: 'M12 4.25l8.25 4.25L12 12.75 3.75 8.5z M3.75 12.25L12 16.5l8.25-4.25 M3.75 16L12 20.25 20.25 16',
  'zoom-mais': 'M10.75 17.25a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5l4.75 4.75 M10.75 8v5.5 M8 10.75h5.5',
  'zoom-menos': 'M10.75 17.25a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5l4.75 4.75 M8 10.75h5.5',
  'tela-cheia': 'M4.25 9V4.25H9 M15 4.25h4.75V9 M19.75 15v4.75H15 M9 19.75H4.25V15',
  medir: 'M3.75 15.5l11.75-11.75 4.75 4.75L8.5 20.25z M7.5 11.75l1.75 1.75 M10.5 8.75l1.75 1.75 M13.5 5.75l1.75 1.75',
  bandeira: 'M5.75 20.25V4.25 M5.75 4.75h12.5l-2.5 4 2.5 4H5.75',
  cerca: 'M5.25 7l6.5-2.75 7 3.25-1.5 8.75-6.5 3.5-5.75-4.5z M12 13.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z',
  lua: 'M19.25 14.25a8 8 0 1 1-9.5-9.5 6.5 6.5 0 0 0 9.5 9.5z',
  // gráficos (cabeçalho de card)
  grafico: 'M5.75 19.25v-7 M10.25 19.25V5.75 M14.75 19.25V9.75 M19.25 19.25v-4.5',
  tendencia: 'M4.25 17.25l5-5 3.5 3.5 7-7.5 M15.25 8.25h4.5v4.5',
  composicao: 'M12 3.75a8.25 8.25 0 1 0 8.25 8.25H12z M14.75 3.9v5.35h5.35a6.25 6.25 0 0 0-5.35-5.35z',
  alvo: 'M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5z M12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z M12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z',
};

export type IconName = keyof typeof P | string;

export function Icon({ name, size = 20, className = '', label }: { name: IconName; size?: number; className?: string; label?: string }) {
  const Solar = SOLAR[name as string];
  if (Solar) {
    return <Solar width={size} height={size} className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={P[name] || P.alerta} />
    </svg>
  );
}

export const ICON_NAMES = Object.keys(P);
