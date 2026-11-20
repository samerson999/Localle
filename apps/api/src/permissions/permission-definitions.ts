import type { Role } from '../auth/jwt';

export interface PermissionDefinition {
  key: string;
  label: string;
  /** Tela/área onde a permissão age — agrupa a matriz de permissões no Setup. */
  tela: string;
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
    tela: 'Ativos',
    label: 'Ver ativos',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'ativos.editar': {
    key: 'ativos.editar',
    tela: 'Ativos',
    label: 'Criar/editar ativos',
    defaultByRole: { admin: true, gestor: true, operador: false },
    editableByClient: true,
  },
  'monitoramento.ver': {
    key: 'monitoramento.ver',
    tela: 'Monitoramento',
    label: 'Ver monitoramento (frota atual e histórico)',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'alertas.tratar': {
    key: 'alertas.tratar',
    tela: 'Monitoramento',
    label: 'Tratar alertas do monitoramento',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'localizacao.compartilhar': {
    key: 'localizacao.compartilhar',
    tela: 'Monitoramento',
    label: 'Gerar e desativar links temporários de localização',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'comandos.enviar': {
    key: 'comandos.enviar',
    tela: 'Comandos ao rastreador',
    label: 'Enviar comandos ao rastreador (ex.: pedir posição)',
    defaultByRole: { admin: true, gestor: true, operador: false },
    editableByClient: true,
  },
  'comandos.bloquear': {
    key: 'comandos.bloquear',
    tela: 'Comandos ao rastreador',
    label: 'Bloquear e desbloquear veículo remotamente',
    defaultByRole: { admin: true, gestor: false, operador: false },
    editableByClient: true,
  },
  'motoristas.editar': {
    key: 'motoristas.editar',
    tela: 'Ativos',
    label: 'Cadastrar e editar motoristas',
    defaultByRole: { admin: true, gestor: true, operador: false },
    editableByClient: true,
  },
  'jornada.ver': {
    key: 'jornada.ver',
    tela: 'Jornada',
    label: 'Ver a tela de Jornada',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'jornada.editar': {
    key: 'jornada.editar',
    tela: 'Jornada',
    label: 'Registrar e corrigir marcações de jornada',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'multas.ver': {
    key: 'multas.ver',
    tela: 'Multas',
    label: 'Ver a tela de Multas',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'multas.editar': {
    key: 'multas.editar',
    tela: 'Multas',
    label: 'Lançar multas e indicar condutor',
    defaultByRole: { admin: true, gestor: true, operador: false },
    editableByClient: true,
  },
  'combustivel.ver': {
    key: 'combustivel.ver',
    tela: 'Combustível',
    label: 'Ver a tela de Combustível',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'combustivel.editar': {
    key: 'combustivel.editar',
    tela: 'Combustível',
    label: 'Lançar abastecimentos',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'manutencao.ver': {
    key: 'manutencao.ver',
    tela: 'Manutenção',
    label: 'Ver a tela de Manutenção',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'manutencao.editar': {
    key: 'manutencao.editar',
    tela: 'Manutenção',
    label: 'Planos de manutenção e ordens de serviço',
    defaultByRole: { admin: true, gestor: true, operador: false },
    editableByClient: true,
  },
  'checklist.ver': {
    key: 'checklist.ver',
    tela: 'Checklist',
    label: 'Ver a tela de Checklist',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'checklist.editar': {
    key: 'checklist.editar',
    tela: 'Checklist',
    label: 'Modelos de checklist e respostas',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'pneus.ver': {
    key: 'pneus.ver',
    tela: 'Pneus',
    label: 'Ver a tela de Pneus',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'pneus.editar': {
    key: 'pneus.editar',
    tela: 'Pneus',
    label: 'Cadastro e movimentação de pneus',
    defaultByRole: { admin: true, gestor: true, operador: false },
    editableByClient: true,
  },
  'ranking.ver': {
    key: 'ranking.ver',
    tela: 'Ranking',
    label: 'Ver a tela de Ranking',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'ranking.editar': {
    key: 'ranking.editar',
    tela: 'Ranking',
    label: 'Matriz de pontos e eventos do ranking',
    defaultByRole: { admin: true, gestor: true, operador: false },
    editableByClient: true,
  },
  'viagens.ver': {
    key: 'viagens.ver',
    tela: 'Viagens',
    label: 'Ver a tela de Viagens',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'viagens.editar': {
    key: 'viagens.editar',
    tela: 'Viagens',
    label: 'Viagens e matrizes de viagem',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'regras.editar': {
    key: 'regras.editar',
    tela: 'Monitoramento',
    label: 'Criar/editar regras de alerta',
    defaultByRole: { admin: true, gestor: true, operador: false },
    editableByClient: true,
  },
  'cercas.editar': {
    key: 'cercas.editar',
    tela: 'Monitoramento',
    label: 'Criar/editar/remover cercas',
    defaultByRole: { admin: true, gestor: true, operador: false },
    editableByClient: true,
  },
  'relatorios.ver': {
    key: 'relatorios.ver',
    tela: 'Relatórios',
    label: 'Ver relatórios',
    defaultByRole: { admin: true, gestor: true, operador: true },
    editableByClient: true,
  },
  'setup.configurar': {
    key: 'setup.configurar',
    tela: 'Setup e equipe',
    label: 'Configurar parâmetros operacionais (Setup)',
    defaultByRole: { admin: true, gestor: false, operador: false },
    editableByClient: true,
  },
  'permissoes.gerenciar': {
    key: 'permissoes.gerenciar',
    tela: 'Setup e equipe',
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
