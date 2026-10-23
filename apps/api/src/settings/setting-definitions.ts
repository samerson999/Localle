export interface SettingDefinition {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  /** Se `boolean`, min/max são ignorados e o valor só pode ser `0`/`1`. */
  type: 'number' | 'boolean';
}

/**
 * "Registro central" do Setup (docs/PLANO-SETUP-ADMIN.md), limitado às chaves que os relatórios de
 * monitoramento (velocidade, paradas) e o futuro alerta de "sem sinal" precisam — não o catálogo inteiro
 * do plano (jornada, combustível, manutenção, pneus, ranking, CAN completo, calibração são de outros
 * módulos, fora do recorte atual). Só a camada Cliente existe (decisão de 23/10/2026, ver a migração de
 * `client_settings`): o valor abaixo é o padrão de plataforma; um override em `client_settings` substitui.
 *
 * Os nomes de chave seguem a intenção do plano, não a seção exata — `can.velocidade_limite_kmh` no plano
 * é parâmetro do módulo de telemetria CAN (fonte de dado própria, que este backend não ingere);
 * `monitoramento.*` aqui aplica a mesma ideia sobre `posicoes.speed_kmh` (GPS do Traccar), a única fonte
 * de velocidade que existe hoje (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.3: "overspeed é 100% do
 * motor de regras do backend").
 */
export const SETTING_DEFINITIONS: Record<string, SettingDefinition> = {
  'monitoramento.velocidade_limite_kmh': {
    key: 'monitoramento.velocidade_limite_kmh',
    label: 'Limite de velocidade (km/h)',
    default: 80,
    min: 20,
    max: 150,
    type: 'number',
  },
  'monitoramento.excesso_episodio_min_s': {
    key: 'monitoramento.excesso_episodio_min_s',
    label: 'Duração mínima acima do limite para contar como excesso (s)',
    default: 10,
    min: 1,
    max: 120,
    type: 'number',
  },
  'monitoramento.parada_min_duracao_min': {
    key: 'monitoramento.parada_min_duracao_min',
    label: 'Duração mínima parado para contar como parada (min)',
    default: 5,
    min: 1,
    max: 60,
    type: 'number',
  },
  'monitoramento.sem_sinal_h': {
    key: 'monitoramento.sem_sinal_h',
    label: 'Tempo sem comunicação para alertar "sem sinal" (h)',
    default: 6,
    min: 0.5,
    max: 72,
    type: 'number',
  },
  'monitoramento.bateria_baixa_v': {
    key: 'monitoramento.bateria_baixa_v',
    label: 'Tensão de bateria considerada baixa (V)',
    default: 11.5,
    min: 9,
    max: 26,
    type: 'number',
  },
};

export function getDefinition(key: string): SettingDefinition | null {
  return SETTING_DEFINITIONS[key] ?? null;
}

export function listDefinitions(): SettingDefinition[] {
  return Object.values(SETTING_DEFINITIONS);
}
