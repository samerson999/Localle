// Páginas do cliente que a Locale libera ou desliga no contrato dele (Console › Contratos; `blockedPages`, desde
// 14/11/2026). Chegam por GET /auth/acessos e ficam no mesmo `revenda.modules` dos módulos, com a rota como chave:
// sem registro = liberada (página nova nasce ligada). A página principal de cada módulo (/monitoramento, /ativos…) não
// tem chave própria: segue o módulo. Minha conta fica sempre liberada (é onde a pessoa troca a senha e sai).
// Página é controle de tela; módulo a API também aplica (ModuloGuard).

export interface Pagina { to: string; label: string; mod?: string }

/** Subpáginas de cada módulo (a principal é o próprio módulo). */
export const PAGINAS_DO_MODULO: Record<string, Pagina[]> = {
  monitoramento: [
    { to: '/inicio', label: 'Início', mod: 'monitoramento' },
    { to: '/monitoramento/replay', label: 'Replay', mod: 'monitoramento' },
    { to: '/monitoramento/cercas', label: 'Cercas', mod: 'monitoramento' },
    { to: '/monitoramento/alertas', label: 'Alertas', mod: 'monitoramento' },
    { to: '/relatorios', label: 'Relatórios', mod: 'monitoramento' },
    { to: '/relatorios/cercas', label: 'Relatório de cercas', mod: 'monitoramento' },
    { to: '/relatorios/velocidade', label: 'Relatório de velocidade', mod: 'monitoramento' },
    { to: '/relatorios/posicoes', label: 'Relatório de posições', mod: 'monitoramento' },
    { to: '/relatorios/passou-por-aqui', label: 'Passou por aqui', mod: 'monitoramento' },
    { to: '/relatorios/uso', label: 'Uso da frota', mod: 'monitoramento' },
  ],
};

/** Páginas fora dos módulos contratáveis. */
export const PAGINAS_GERAIS: Pagina[] = [
  { to: '/precisa-de-voce', label: 'Precisa de você' },
  { to: '/setup', label: 'Setup' },
  { to: '/equipe', label: 'Equipe' },
];

const todas = [...Object.values(PAGINAS_DO_MODULO).flat(), ...PAGINAS_GERAIS];

/** Relatório individual também depende do hub /relatorios estar ligado. */
const pai = (to: string) => (to.startsWith('/relatorios/') ? '/relatorios' : null);

/** Rota liberada: módulo dela ligado, ela não desligada e, se for relatório, o hub também. Rota fora do catálogo: sempre. */
export function paginaLiberada(modules: Record<string, boolean | undefined>, to: string): boolean {
  const p = todas.find((x) => x.to === to);
  if (!p) return true;
  if (p.mod && !modules[p.mod]) return false;
  if (modules[to] === false) return false;
  const hub = pai(to);
  return hub ? modules[hub] !== false : true;
}
