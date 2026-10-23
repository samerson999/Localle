import type { Role } from '../auth/jwt';

export interface PermissionDefinition {
  key: string;
  label: string;
  defaultByRole: Record<Role, boolean>;
  /**
   * Se `false`, nenhum override é aceito para esta chave em nenhum papel — a Locale travou o
   * comportamento. `permissoes.gerenciar` é sempre travada: delegável, ela permitiria um
   * gestor/operador se promover a admin de fato (autoescalonamento de privilégio).
   */
  editableByClient: boolean;
}

/**
 * Catálogo de permissões — mesmo raciocínio de `settings/setting-definitions.ts` (padrão da plataforma
 * em código, override por cliente no banco), mas em tabela própria (`role_permission_overrides`), não
 * `client_settings`: autorização não pode depender do mesmo armazenamento genérico de parâmetro
 * operacional (decisão de 23/10/2026).
 *
 * **Guarda-corpo da auditoria de 23/10/2026 (achado #3)**: `setup.configurar` autoriza só os parâmetros
 * operacionais de `settings/setting-definitions.ts` (hoje: limites de monitoramento/velocidade/parada).
 * Contrato, faturamento, plano comercial e qualquer parâmetro financeiro — quando ganharem representação
 * no backend — **nunca** entram sob esta chave; precisam de uma chave própria (ex. `faturamento.ver`,
 * `contrato.editar`), com seu próprio `defaultByRole` tipicamente mais restrito que o de Setup. Reusar
 * `setup.configurar` para isso concederia acesso financeiro para quem só deveria mexer em limite de
 * velocidade.
 */
export const PERMISSION_DEFINITIONS: Record<string, PermissionDefinition> = {
  'ativos.ver': {
    key: 'ativos.ver',
    label: 'Ver ativos',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'ativos.editar': {
    key: 'ativos.editar',
    label: 'Criar/editar ativos',
    defaultByRole: { admin: true, gestor: true, operador: false },
    editableByClient: true,
  },
  'monitoramento.ver': {
    key: 'monitoramento.ver',
    label: 'Ver monitoramento (frota atual e histórico)',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'relatorios.ver': {
    key: 'relatorios.ver',
    label: 'Ver relatórios',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'setup.configurar': {
    key: 'setup.configurar',
    label: 'Configurar parâmetros operacionais (Setup)',
    defaultByRole: { admin: true, gestor: false, operador: false },
    editableByClient: true,
  },
  'permissoes.gerenciar': {
    key: 'permissoes.gerenciar',
    label: 'Gerenciar equipe e permissões de acesso',
    defaultByRole: { admin: true, gestor: false, operador: false },
    editableByClient: false,
  },
};

export function getPermissionDefinition(key: string): PermissionDefinition | null {
  return PERMISSION_DEFINITIONS[key] ?? null;
}

export function listPermissionDefinitions(): PermissionDefinition[] {
  return Object.values(PERMISSION_DEFINITIONS);
}
