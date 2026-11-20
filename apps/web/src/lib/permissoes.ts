// Permissões do perfil de quem está logado (GET /auth/acessos → `permissoes` no store, 20/11/2026). Só esconde tela e
// botão: quem decide é a API (PermissionsGuard), que lê o perfil do banco a cada requisição. `null` = ainda não
// carregou (ou sessão sem cliente): libera, e a API responde 403 se for o caso.
import { useStore } from './store';

/** Permissão de "ver" que abre a tela principal de cada módulo do menu. */
export const VER_DO_MODULO: Record<string, string> = {
  monitoramento: 'monitoramento.ver', ativos: 'ativos.ver', manutencao: 'manutencao.ver', combustivel: 'combustivel.ver',
  checklist: 'checklist.ver', viagens: 'viagens.ver', multas: 'multas.ver', jornada: 'jornada.ver', ranking: 'ranking.ver', pneus: 'pneus.ver',
};

/** Telas fora dos módulos com permissão própria (rota → chave). */
const VER_DA_ROTA: Record<string, string> = { '/relatorios': 'relatorios.ver', '/equipe': 'permissoes.gerenciar' };

export const pode = (permissoes: string[] | null | undefined, key: string) => !permissoes || permissoes.includes(key);

export function usePode(key: string): boolean {
  return useStore((s) => pode(s.permissoes, key));
}

/** Rota aberta para o perfil: módulo dela visível e, se tiver chave própria (ex.: relatórios), ela também. */
export function rotaPermitida(permissoes: string[] | null | undefined, to: string, mod?: string): boolean {
  const base = to.split('?')[0];
  const daRota = Object.entries(VER_DA_ROTA).find(([r]) => base === r || base.startsWith(r + '/'))?.[1];
  if (daRota && !pode(permissoes, daRota)) return false;
  const k = mod ? VER_DO_MODULO[mod] : undefined;
  return !k || pode(permissoes, k);
}
