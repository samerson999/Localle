import type { ComponentType, SVGProps } from 'react';

// Ícones da plataforma: Solar Icons (480 Design, CC BY 4.0), variante "Bold Duotone" —
// mesmo conjunto usado pelo Visor (dashboard.visorfinance.app). Nenhum ícone é desenhado à mão:
// ícone novo = importar do Solar aqui e dar um nome. Resolvidos em build-time pelo unplugin-icons
// (vite.config.ts); catálogo em https://icon-sets.iconify.design/solar/ (filtrar "bold-duotone").

// módulos
import Monitoramento from '~icons/solar/map-point-wave-bold-duotone';
import Relatorios from '~icons/solar/document-text-bold-duotone';
import Ativos from '~icons/solar/delivery-bold-duotone';
import Manutencao from '~icons/solar/toolbox-bold-duotone';
import Combustivel from '~icons/solar/gas-station-bold-duotone';
import Checklist from '~icons/solar/checklist-bold-duotone';
import Viagens from '~icons/solar/route-bold-duotone';
import Multas from '~icons/solar/ticket-bold-duotone';
import Jornada from '~icons/solar/clock-circle-bold-duotone';
import Pneus from '~icons/solar/wheel-bold-duotone';
import Ranking from '~icons/solar/cup-first-bold-duotone';
import Revenda from '~icons/solar/shop-bold-duotone';
import Locale from '~icons/solar/buildings-2-bold-duotone';
import Design from '~icons/solar/widget-add-bold-duotone';
// shell
import Busca from '~icons/solar/magnifer-bold-duotone';
import Atencao from '~icons/solar/danger-triangle-bold-duotone';
import Marca from '~icons/solar/palette-bold-duotone';
import Config from '~icons/solar/settings-minimalistic-bold-duotone';
import Ajuda from '~icons/solar/question-circle-bold-duotone';
import Sair from '~icons/solar/logout-2-bold-duotone';
import Expandir from '~icons/solar/alt-arrow-right-bold-duotone';
import Recolher from '~icons/solar/alt-arrow-left-bold-duotone';
import Abaixo from '~icons/solar/alt-arrow-down-bold-duotone';
import Menu from '~icons/solar/hamburger-menu-bold-duotone';
import Fechar from '~icons/solar/close-circle-bold-duotone';
import Mais from '~icons/solar/add-circle-bold-duotone';
import Menos from '~icons/solar/minus-circle-bold-duotone';
import Check from '~icons/solar/check-bold-duotone';
import Traco from '~icons/solar/minus-bold-duotone';
import Play from '~icons/solar/play-bold-duotone';
import Pause from '~icons/solar/pause-bold-duotone';
import Reiniciar from '~icons/solar/restart-bold-duotone';
import Filtro from '~icons/solar/filter-bold-duotone';
import Exportar from '~icons/solar/download-minimalistic-bold-duotone';
import Importar from '~icons/solar/upload-minimalistic-bold-duotone';
import Calendario from '~icons/solar/calendar-bold-duotone';
import Externo from '~icons/solar/arrow-right-up-bold-duotone';
import Banco from '~icons/solar/database-bold-duotone';
import Sinal from '~icons/solar/wi-fi-router-minimalistic-bold-duotone';
import Ok from '~icons/solar/check-circle-bold-duotone';
import Dinheiro from '~icons/solar/wallet-money-bold-duotone';
import Cadeado from '~icons/solar/lock-keyhole-bold-duotone';
import Camera from '~icons/solar/camera-bold-duotone';
import Rota from '~icons/solar/routing-bold-duotone';
import Comando from '~icons/solar/code-square-bold-duotone';
import Inicio from '~icons/solar/home-2-bold-duotone';
import Lua from '~icons/solar/moon-bold-duotone';
import Sol from '~icons/solar/sun-bold-duotone';
// ações
import MaisOpcoes from '~icons/solar/menu-dots-bold-duotone';
import Editar from '~icons/solar/pen-bold-duotone';
import Excluir from '~icons/solar/trash-bin-trash-bold-duotone';
import Visualizar from '~icons/solar/eye-bold-duotone';
import Duplicar from '~icons/solar/copy-bold-duotone';
import Historico from '~icons/solar/history-bold-duotone';
import Imprimir from '~icons/solar/printer-bold-duotone';
import Compartilhar from '~icons/solar/share-bold-duotone';
import Enviar from '~icons/solar/plain-bold-duotone';
import Link from '~icons/solar/link-bold-duotone';
import Anexo from '~icons/solar/paperclip-bold-duotone';
import Ordenar from '~icons/solar/sort-vertical-bold-duotone';
import Alta from '~icons/solar/arrow-up-bold-duotone';
import Baixa from '~icons/solar/arrow-down-bold-duotone';
// comunicação e feedback
import Info from '~icons/solar/info-circle-bold-duotone';
import Erro from '~icons/solar/close-circle-bold-duotone';
import Mensagem from '~icons/solar/chat-round-dots-bold-duotone';
import Email from '~icons/solar/letter-bold-duotone';
import Documento from '~icons/solar/document-bold-duotone';
// pessoas e gestão
import Usuario from '~icons/solar/user-bold-duotone';
import Equipe from '~icons/solar/users-group-rounded-bold-duotone';
import Escudo from '~icons/solar/shield-check-bold-duotone';
import Trofeu from '~icons/solar/cup-star-bold-duotone';
// condução e telemetria
import Velocimetro from '~icons/solar/speedometer-middle-bold-duotone';
import Odometro from '~icons/solar/streets-bold-duotone';
import Bateria from '~icons/solar/battery-full-bold-duotone';
import Temperatura from '~icons/solar/temperature-bold-duotone';
import Online from '~icons/solar/wi-fi-bold-duotone';
import Chave from '~icons/solar/key-bold-duotone';
import Gps from '~icons/solar/satellite-bold-duotone';
// mapa
import Centralizar from '~icons/solar/gps-bold-duotone';
import Camadas from '~icons/solar/layers-bold-duotone';
import ZoomMais from '~icons/solar/magnifer-zoom-in-bold-duotone';
import ZoomMenos from '~icons/solar/magnifer-zoom-out-bold-duotone';
import TelaCheia from '~icons/solar/full-screen-bold-duotone';
import Medir from '~icons/solar/ruler-bold-duotone';
import Bandeira from '~icons/solar/flag-bold-duotone';
import Cerca from '~icons/solar/map-bold-duotone';
import SaidaCerca from '~icons/solar/map-point-remove-bold-duotone';
import Parada from '~icons/solar/stop-circle-bold-duotone';
import Local from '~icons/solar/map-point-bold-duotone';
import StreetView from '~icons/solar/walking-bold-duotone';
// gráficos (cabeçalho de card)
import Grafico from '~icons/solar/chart-2-bold-duotone';
import Tendencia from '~icons/solar/graph-up-bold-duotone';
import Composicao from '~icons/solar/pie-chart-2-bold-duotone';
import Alvo from '~icons/solar/target-bold-duotone';

const ICONS = {
  monitoramento: Monitoramento, relatorios: Relatorios, ativos: Ativos, manutencao: Manutencao, combustivel: Combustivel,
  checklist: Checklist, viagens: Viagens, multas: Multas, jornada: Jornada, pneus: Pneus, ranking: Ranking,
  revenda: Revenda, locale: Locale, design: Design,
  busca: Busca, atencao: Atencao, marca: Marca, config: Config, ajuda: Ajuda, sair: Sair,
  expandir: Expandir, recolher: Recolher, chevron: Expandir, voltar: Recolher, abaixo: Abaixo, menu: Menu, fechar: Fechar,
  mais: Mais, menos: Menos, check: Check, traco: Traco, play: Play, pause: Pause, reiniciar: Reiniciar, filtro: Filtro, exportar: Exportar,
  importar: Importar, calendario: Calendario, externo: Externo, banco: Banco, sinal: Sinal, alerta: Atencao, ok: Ok,
  relogio: Jornada, dinheiro: Dinheiro, cadeado: Cadeado, camera: Camera, rota: Rota, comando: Comando,
  inicio: Inicio, lua: Lua, sol: Sol,
  'mais-opcoes': MaisOpcoes, editar: Editar, excluir: Excluir, visualizar: Visualizar, duplicar: Duplicar,
  historico: Historico, imprimir: Imprimir, compartilhar: Compartilhar, enviar: Enviar, link: Link, anexo: Anexo,
  ordenar: Ordenar, alta: Alta, baixa: Baixa,
  info: Info, sucesso: Ok, erro: Erro, mensagem: Mensagem, email: Email, documento: Documento,
  usuario: Usuario, equipe: Equipe, escudo: Escudo, trofeu: Trofeu,
  velocimetro: Velocimetro, odometro: Odometro, bateria: Bateria, temperatura: Temperatura, online: Online, chave: Chave, gps: Gps,
  centralizar: Centralizar, camadas: Camadas, 'zoom-mais': ZoomMais, 'zoom-menos': ZoomMenos, 'tela-cheia': TelaCheia,
  medir: Medir, bandeira: Bandeira, cerca: Cerca, 'saida-cerca': SaidaCerca, parada: Parada, local: Local, 'street-view': StreetView,
  grafico: Grafico, tendencia: Tendencia, composicao: Composicao, alvo: Alvo,
} satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

// Nome fechado: um nome que não existe quebra o typecheck em vez de cair num ícone qualquer.
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, className = '', label }: { name: IconName; size?: number; className?: string; label?: string }) {
  // nome vindo de dado sem tipo (any) que não existe: sem isto o React derruba a tela inteira; o typecheck pega os literais
  const Svg = ICONS[name] ?? ICONS.atencao;
  if (!ICONS[name] && import.meta.env.DEV) console.warn(`[icons] ícone inexistente: "${String(name)}"`);
  return <Svg width={size} height={size} className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
