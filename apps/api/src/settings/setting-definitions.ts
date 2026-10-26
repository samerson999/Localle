export type SettingValue = number | string;

export interface SettingDefinition {
  key: string;
  /** Aba da tela Setup (docs/PLANO-SETUP-ADMIN.md § 3). */
  modulo: string;
  label: string;
  default: SettingValue;
  min: number;
  max: number;
  /** `boolean`: min/max ignorados, só `0`/`1`. `option`: só um de `options`. */
  type: 'number' | 'boolean' | 'option';
  options?: string[];
  /** Chave que também aceita override por grupo de ativos (camada G do plano). */
  porGrupo?: boolean;
  /** Piso legal: o valor só pode endurecer — `down` = nunca acima do limite, `up` = nunca abaixo. */
  legal?: { limite: number; endurece: 'up' | 'down'; ref: string };
  /** `agora`: vale a partir da alteração (o histórico guarda o valor por data). `recalcula`: relatórios recalculam. */
  aplicacao: 'agora' | 'recalcula';
  /** Camada Plataforma (só a Locale): o cliente vê o valor vigente mas não altera. Sem tabela da camada ainda, vale o padrão em código. */
  somenteLocale?: boolean;
}

type Def = Omit<SettingDefinition, 'key' | 'type' | 'aplicacao'> & { type?: SettingDefinition['type']; aplicacao?: SettingDefinition['aplicacao'] };

const def = (key: string, d: Def): SettingDefinition => ({ key, type: 'number', aplicacao: 'recalcula', ...d });
const bool = (key: string, modulo: string, label: string, ligado: boolean, aplicacao: SettingDefinition['aplicacao'] = 'agora'): SettingDefinition =>
  ({ key, modulo, label, default: ligado ? 1 : 0, min: 0, max: 1, type: 'boolean', aplicacao });
const opt = (key: string, modulo: string, label: string, options: string[], padrao: string, porGrupo = false): SettingDefinition =>
  ({ key, modulo, label, default: padrao, min: 0, max: 0, type: 'option', options, porGrupo, aplicacao: 'agora' });

/**
 * "Registro central" do Setup (docs/PLANO-SETUP-ADMIN.md § 3), camada Cliente (+ Grupo nas chaves marcadas)
 * — o padrão de cada chave é o da plataforma; override do cliente em `client_settings`, do grupo em
 * `group_settings`. Ficaram de fora as camadas que não existem no backend (Revenda, Modelo de rastreador,
 * Integração/Cobrança só da Locale). As chaves `monitoramento.*` já existiam antes do inventário e foram
 * mantidas com o nome original (os relatórios as usam); `can.velocidade_limite_kmh` do plano é a mesma
 * ideia aplicada ao GPS do Traccar, única fonte de velocidade hoje.
 *
 * Mínimos e máximos são a proposta técnica do plano (§ 8, decisão 4 ainda a validar com a operação).
 */
const LISTA: SettingDefinition[] = [
  // Monitoramento e alertas (§ 3.9)
  def('monitoramento.velocidade_limite_kmh', { modulo: 'monitoramento', label: 'Limite de velocidade (km/h)', default: 80, min: 20, max: 150, porGrupo: true }),
  def('monitoramento.excesso_episodio_min_s', { modulo: 'monitoramento', label: 'Duração mínima acima do limite para contar como excesso (s)', default: 10, min: 1, max: 120 }),
  def('monitoramento.parada_min_duracao_min', { modulo: 'monitoramento', label: 'Duração mínima parado para contar como parada (min)', default: 5, min: 1, max: 60 }),
  def('monitoramento.sem_sinal_h', { modulo: 'monitoramento', label: 'Tempo sem comunicação para alertar "sem sinal" (h)', default: 6, min: 0.5, max: 72, porGrupo: true }),
  def('monitoramento.bateria_baixa_v', { modulo: 'monitoramento', label: 'Tensão de bateria considerada baixa (V)', default: 11.5, min: 9, max: 26, porGrupo: true }),
  bool('monitoramento.bloqueio_pendente_critico', 'monitoramento', 'Bloqueio pendente entra como crítico no "Precisa de você"', true),
  def('alertas.reaviso_regra_min', { modulo: 'monitoramento', label: 'Intervalo para reavisar a mesma regra (min)', default: 15, min: 1, max: 240, aplicacao: 'agora' }),
  def('alertas.janela_tratativas_h', { modulo: 'monitoramento', label: 'Janela de alertas tratados exibidos (h)', default: 24, min: 1, max: 168 }),
  def('cercas.raio_padrao_m', { modulo: 'monitoramento', label: 'Raio padrão de cerca nova (m)', default: 200, min: 20, max: 5000, aplicacao: 'agora' }),
  def('monitoramento.passou_aqui_raio_m', { modulo: 'monitoramento', label: 'Raio do "Passou por aqui" (m)', default: 200, min: 20, max: 5000, aplicacao: 'agora' }),

  // Comandos (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.6)
  def('comandos.bloqueio_velocidade_max_kmh', { modulo: 'monitoramento', label: 'Velocidade máxima para aceitar bloqueio remoto (km/h)', default: 5, min: 0, max: 30, aplicacao: 'agora' }),
  def('comandos.bloqueio_posicao_max_idade_min', { modulo: 'monitoramento', label: 'Idade máxima da última posição para aceitar bloqueio (min)', default: 15, min: 1, max: 240, aplicacao: 'agora' }),
  def('comandos.timeout_min', { modulo: 'monitoramento', label: 'Tempo de espera pela confirmação do aparelho antes de expirar o comando (min)', default: 10, min: 1, max: 120, aplicacao: 'agora' }),

  // Jornada — Lei 13.103/2015 (§ 3.1). "agora": o espelho de ponto é documento; usa o valor da data.
  def('jornada.base_diaria_h', { modulo: 'jornada', label: 'Jornada diária base (h)', default: 8, min: 4, max: 8, porGrupo: true, aplicacao: 'agora', legal: { limite: 8, endurece: 'down', ref: 'CLT art. 235-C, caput' } }),
  def('jornada.extras_max_h', { modulo: 'jornada', label: 'Horas extras máximas por dia (h)', default: 2, min: 0, max: 4, porGrupo: true, aplicacao: 'agora', legal: { limite: 4, endurece: 'down', ref: 'CLT art. 235-C, caput (acima de 2 h exige convenção coletiva)' } }),
  def('jornada.refeicao_min_h', { modulo: 'jornada', label: 'Refeição mínima (h)', default: 1, min: 1, max: 2, porGrupo: true, aplicacao: 'agora', legal: { limite: 1, endurece: 'up', ref: 'CLT art. 235-C §2º' } }),
  def('jornada.refeicao_obrigatoria_apos_h', { modulo: 'jornada', label: 'Refeição obrigatória após (h)', default: 6, min: 4, max: 6, porGrupo: true, aplicacao: 'agora', legal: { limite: 6, endurece: 'down', ref: 'CLT art. 71' } }),
  def('jornada.interjornada_min_h', { modulo: 'jornada', label: 'Interjornada mínima (h)', default: 11, min: 11, max: 16, porGrupo: true, aplicacao: 'agora', legal: { limite: 11, endurece: 'up', ref: 'CLT art. 235-C §3º' } }),
  def('jornada.descanso_semanal_min_h', { modulo: 'jornada', label: 'Descanso semanal mínimo (h)', default: 35, min: 35, max: 72, porGrupo: true, aplicacao: 'agora', legal: { limite: 35, endurece: 'up', ref: 'CLT art. 235-D' } }),
  def('jornada.direcao_continua_cargas_h', { modulo: 'jornada', label: 'Direção contínua máxima — cargas (h)', default: 5.5, min: 2, max: 5.5, porGrupo: true, aplicacao: 'agora', legal: { limite: 5.5, endurece: 'down', ref: 'CTB art. 67-C' } }),
  def('jornada.direcao_continua_passageiros_h', { modulo: 'jornada', label: 'Direção contínua máxima — passageiros (h)', default: 4, min: 2, max: 4, porGrupo: true, aplicacao: 'agora', legal: { limite: 4, endurece: 'down', ref: 'CTB art. 67-C' } }),
  def('jornada.apontamentos_atencao', { modulo: 'jornada', label: 'Apontamentos em 30 dias para entrar em atenção', default: 3, min: 1, max: 30 }),

  // Combustível (§ 3.2)
  def('combustivel.salto_km_suspeito', { modulo: 'combustivel', label: 'Salto de km suspeito entre abastecimentos (km)', default: 10000, min: 500, max: 50000, porGrupo: true, aplicacao: 'agora' }),
  def('combustivel.meta_kml', { modulo: 'combustivel', label: 'Meta de consumo da empresa (km/L)', default: 5, min: 0.5, max: 30, porGrupo: true }),
  def('combustivel.orcamento_mensal', { modulo: 'combustivel', label: 'Orçamento mensal (R$)', default: 80000, min: 0, max: 100_000_000, porGrupo: true }),
  def('combustivel.tol_litros_pct', { modulo: 'combustivel', label: 'Tolerância de litros entre nota e abastecimento (%)', default: 2, min: 0, max: 20 }),
  def('combustivel.tol_valor_rs', { modulo: 'combustivel', label: 'Tolerância de valor entre nota e abastecimento (R$)', default: 1, min: 0, max: 50 }),
  def('combustivel.tol_data_dias', { modulo: 'combustivel', label: 'Tolerância de data entre nota e abastecimento (dias)', default: 1, min: 0, max: 7 }),
  bool('combustivel.exigir_mesmo_posto', 'combustivel', 'Exigir o mesmo posto na nota e no abastecimento', true, 'recalcula'),
  bool('combustivel.ocr_ativo', 'combustivel', 'Leitura automática (OCR) de notas fiscais', false),
  def('combustivel.tol_km_rastreador', { modulo: 'combustivel', label: 'Tolerância entre km informado e km do rastreador (km)', default: 50, min: 0, max: 2000 }),

  // Odômetro (§ 3.3)
  def('odometro.divergencia_min_km', { modulo: 'ativos', label: 'Divergência mínima de odômetro para alertar (km)', default: 500, min: 50, max: 5000, aplicacao: 'agora' }),
  def('odometro.divergencia_pct', { modulo: 'ativos', label: 'Divergência de odômetro para alertar (%)', default: 3, min: 0.5, max: 20, aplicacao: 'agora' }),

  // Manutenção (§ 3.4)
  def('manutencao.critico_apos_dias', { modulo: 'manutencao', label: 'Plano vencido vira crítico após (dias)', default: 10, min: 1, max: 90, aplicacao: 'agora' }),
  def('manutencao.critico_apos_km', { modulo: 'manutencao', label: 'Plano vencido vira crítico após (km)', default: 1000, min: 100, max: 50000, aplicacao: 'agora' }),
  def('manutencao.plano_padrao_km', { modulo: 'manutencao', label: 'Intervalo padrão de plano novo (km)', default: 10000, min: 500, max: 200000, aplicacao: 'agora' }),
  def('manutencao.plano_padrao_dias', { modulo: 'manutencao', label: 'Intervalo padrão de plano novo (dias)', default: 180, min: 7, max: 730, aplicacao: 'agora' }),
  def('manutencao.antecedencia_padrao_km', { modulo: 'manutencao', label: 'Antecedência padrão do aviso (km)', default: 1000, min: 0, max: 20000, aplicacao: 'agora' }),
  def('manutencao.antecedencia_padrao_dias', { modulo: 'manutencao', label: 'Antecedência padrão do aviso (dias)', default: 15, min: 0, max: 90, aplicacao: 'agora' }),
  def('manutencao.meta_disponibilidade', { modulo: 'manutencao', label: 'Meta de disponibilidade da frota (%)', default: 95, min: 50, max: 100, porGrupo: true }),
  def('manutencao.os_parada_alerta_h', { modulo: 'manutencao', label: 'OS parada em alerta após (h)', default: 24, min: 1, max: 240 }),
  def('manutencao.os_parada_critica_h', { modulo: 'manutencao', label: 'OS parada crítica após (h)', default: 48, min: 2, max: 480 }),
  def('manutencao.aprovacao_lenta_h', { modulo: 'manutencao', label: 'Aprovação lenta de OS após (h)', default: 24, min: 1, max: 240 }),

  // Pneus (§ 3.5)
  def('pneus.sulco_alerta_mm', { modulo: 'pneus', label: 'Sulco em alerta (mm)', default: 5, min: 2, max: 12, porGrupo: true }),
  def('pneus.sulco_retirada_mm', { modulo: 'pneus', label: 'Sulco de retirada (mm)', default: 3, min: 1.6, max: 8, porGrupo: true, legal: { limite: 1.6, endurece: 'up', ref: 'Res. CONTRAN 558/1980' } }),
  def('pneus.custo_recapagem_padrao', { modulo: 'pneus', label: 'Custo padrão de recapagem (R$)', default: 650, min: 0, max: 100000, aplicacao: 'agora' }),
  def('pneus.vidas_padrao', { modulo: 'pneus', label: 'Vidas padrão do pneu', default: 3, min: 1, max: 8, aplicacao: 'agora' }),

  // Ranking (§ 3.6)
  def('ranking.limite_pontos', { modulo: 'ranking', label: 'Limite de pontos por período', default: 100, min: 1, max: 10000, porGrupo: true }),
  opt('ranking.periodo_limite', 'ranking', 'Período do limite de pontos', ['semana', 'mes', 'trimestre'], 'mes'),

  // Telemetria CAN (§ 3.7) — faixas por grupo porque dependem do motor
  def('can.excesso_episodio_s', { modulo: 'can', label: 'Duração mínima acima do limite (CAN) (s)', default: 10, min: 1, max: 120 }),
  def('can.rpm_lenta_max', { modulo: 'can', label: 'RPM máximo da marcha lenta', default: 900, min: 500, max: 1500, porGrupo: true }),
  def('can.rpm_verde_max', { modulo: 'can', label: 'RPM máximo da faixa verde', default: 1600, min: 800, max: 3000, porGrupo: true }),
  def('can.rpm_amarela_max', { modulo: 'can', label: 'RPM máximo da faixa amarela', default: 2100, min: 1000, max: 4000, porGrupo: true }),
  def('can.banguela_vel_min_kmh', { modulo: 'can', label: 'Velocidade mínima para detectar banguela (km/h)', default: 20, min: 5, max: 60, porGrupo: true }),
  def('can.pedal_fundo_pct', { modulo: 'can', label: 'Pedal no fundo a partir de (%)', default: 90, min: 50, max: 100, porGrupo: true }),
  def('can.temperatura_alta_c', { modulo: 'can', label: 'Temperatura alta do motor (°C)', default: 100, min: 80, max: 130, porGrupo: true }),
  def('can.ocioso_episodio_min', { modulo: 'can', label: 'Duração mínima de motor ocioso (min)', default: 5, min: 1, max: 60, porGrupo: true }),

  // Checklist e multas (§ 3.10)
  def('checklist.ciclo_padrao_dias', { modulo: 'checklist', label: 'Ciclo padrão de checklist novo (dias)', default: 30, min: 1, max: 365, aplicacao: 'agora' }),
  opt('checklist.escala_nota_padrao', 'checklist', 'Escala de nota padrão', ['1a5', '1a10'], '1a5'),
  def('checklist.meta_adesao', { modulo: 'checklist', label: 'Meta de adesão (%)', default: 85, min: 50, max: 100 }),
  def('checklist.meta_tempo_min', { modulo: 'checklist', label: 'Meta de tempo de resposta (min)', default: 8, min: 1, max: 60 }),
  def('multas.vencimento_padrao_dias', { modulo: 'multas', label: 'Vencimento padrão de multa nova (dias)', default: 30, min: 1, max: 120, aplicacao: 'agora' }),
  def('multas.indicacao_prazo_dias', { modulo: 'multas', label: 'Prazo para indicar o condutor (dias)', default: 30, min: 1, max: 30, aplicacao: 'agora', legal: { limite: 30, endurece: 'down', ref: 'CTB art. 257 §7º' } }),
  def('multas.indicacao_aviso_dias', { modulo: 'multas', label: 'Aviso de indicação a vencer (dias antes)', default: 7, min: 1, max: 29, aplicacao: 'agora' }),
  def('multas.indicacao_critico_dias', { modulo: 'multas', label: 'Indicação crítica (dias antes)', default: 3, min: 1, max: 29, aplicacao: 'agora' }),
  def('multas.cnh_limite_2_gravissimas', { modulo: 'multas', label: 'Limite de pontos com 2+ gravíssimas', default: 20, min: 5, max: 20, legal: { limite: 20, endurece: 'down', ref: 'CTB art. 261, I' } }),
  def('multas.cnh_limite_1_gravissima', { modulo: 'multas', label: 'Limite de pontos com 1 gravíssima', default: 30, min: 5, max: 30, legal: { limite: 30, endurece: 'down', ref: 'CTB art. 261, I' } }),
  def('multas.cnh_limite_sem_gravissima', { modulo: 'multas', label: 'Limite de pontos sem gravíssima', default: 40, min: 5, max: 40, legal: { limite: 40, endurece: 'down', ref: 'CTB art. 261, I' } }),
  def('multas.cnh_limite_ear', { modulo: 'multas', label: 'Limite de pontos com EAR', default: 40, min: 5, max: 40, legal: { limite: 40, endurece: 'down', ref: 'CTB art. 261 §5º' } }),
  def('multas.cnh_risco_pct', { modulo: 'multas', label: 'CNH em risco a partir de (% do limite)', default: 75, min: 30, max: 100 }),

  // Viagens (§ 3.13)
  def('viagens.tolerancia_cumprimento_min', { modulo: 'viagens', label: 'Tolerância de cumprimento de horário (min)', default: 30, min: 5, max: 180, porGrupo: true }),
  def('viagens.rodando_sem_viagem_min', { modulo: 'viagens', label: 'Avisar "rodando sem viagem" após (min)', default: 10, min: 1, max: 120, porGrupo: true, aplicacao: 'agora' }),
  def('viagens.hora_volta_padrao', { modulo: 'viagens', label: 'Hora de volta padrão', default: 18, min: 0, max: 23, porGrupo: true, aplicacao: 'agora' }),
  opt('viagens.rodando_sem_viagem_prioridade', 'viagens', 'Prioridade do aviso "rodando sem viagem"', ['baixa', 'media'], 'media', true),

  // Retenção (docs/ARQUITETURA-BACKEND.md § 2.4; decisão de 26/10/2026: parâmetro do Setup, só da Locale).
  // O prazo de posições de cada cliente é `contrato_versoes.historico_meses` (contrato, não Setup).
  def('retencao.eventos_minimo_meses', { modulo: 'integracao', label: 'Retenção mínima de eventos, mesmo em plano curto (meses)', default: 24, min: 1, max: 120, aplicacao: 'agora', somenteLocale: true }),
  def('retencao.posicao_sem_cliente_meses', { modulo: 'integracao', label: 'Retenção de posições sem cliente (rastreador sem instalação) (meses)', default: 13, min: 1, max: 60, aplicacao: 'agora', somenteLocale: true }),

  // Suporte (§ 3.14)
  bool('suporte.exige_permissao_cliente', 'suporte', 'Acesso de suporte só com liberação do cliente', false),

  // Documentos e motoristas (§ 3.15)
  def('documentos.atencao_dias', { modulo: 'ativos', label: 'Documento em atenção (dias antes do vencimento)', default: 30, min: 1, max: 120 }),
  def('documentos.critico_dias', { modulo: 'ativos', label: 'Documento crítico (dias antes do vencimento)', default: 7, min: 0, max: 60 }),
  def('motoristas.cnh_atencao_dias', { modulo: 'motoristas', label: 'CNH/toxicológico em atenção (dias antes)', default: 30, min: 1, max: 120 }),
  def('motoristas.cnh_critico_dias', { modulo: 'motoristas', label: 'CNH/toxicológico crítico (dias antes)', default: 7, min: 0, max: 60 }),
  opt('motoristas.origem_prioridade', 'motoristas', 'Origem do motorista que prevalece', ['rastreador>app>escala', 'app>rastreador>escala', 'escala>rastreador>app'], 'rastreador>app>escala'),
];

export const SETTING_DEFINITIONS: Record<string, SettingDefinition> = Object.fromEntries(LISTA.map((d) => [d.key, d]));

/**
 * Regras cruzadas (§ 4 do plano): cada entrada é checada com os valores resolvidos do mesmo escopo depois
 * de aplicar a mudança. `ordem`: os valores precisam ser estritamente crescentes.
 */
export const REGRAS_CRUZADAS: { ordem: string[]; mensagem: string }[] = [
  { ordem: ['pneus.sulco_retirada_mm', 'pneus.sulco_alerta_mm'], mensagem: 'O sulco de alerta precisa ser maior que o de retirada' },
  { ordem: ['can.rpm_lenta_max', 'can.rpm_verde_max', 'can.rpm_amarela_max'], mensagem: 'RPM: lenta < verde < amarela' },
  { ordem: ['multas.indicacao_critico_dias', 'multas.indicacao_aviso_dias'], mensagem: 'O prazo crítico da indicação precisa ser menor que o de aviso' },
  { ordem: ['documentos.critico_dias', 'documentos.atencao_dias'], mensagem: 'Documentos: crítico precisa ser menor que atenção' },
  { ordem: ['motoristas.cnh_critico_dias', 'motoristas.cnh_atencao_dias'], mensagem: 'CNH: crítico precisa ser menor que atenção' },
  { ordem: ['manutencao.os_parada_alerta_h', 'manutencao.os_parada_critica_h'], mensagem: 'OS parada: alerta precisa vir antes do crítico' },
];

export function getDefinition(key: string): SettingDefinition | null {
  return SETTING_DEFINITIONS[key] ?? null;
}

export function listDefinitions(): SettingDefinition[] {
  return LISTA;
}
