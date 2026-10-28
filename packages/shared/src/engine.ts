// Constantes de domínio compartilhadas pelas telas de monitoramento, regras e cercas.

export const BATTERY_LOW_V = 11.5;

export const RULE_FIELDS: Record<string, { label: string; ops: string[]; values?: string[]; unit?: string; src: string }> = {
  velocidade: { label: 'Velocidade (km/h)', ops: ['>', '<'], src: 'Rastreador' },
  ignicao: { label: 'Ignição', ops: ['='], values: ['Ligada', 'Desligada'], src: 'Rastreador' },
  bateria: { label: 'Tensão da bateria (V)', ops: ['<', '>'], src: 'Rastreador' },
  temperatura: { label: 'Temperatura do baú (°C)', ops: ['>', '<'], src: 'Sensor' },
  porta: { label: 'Porta do baú', ops: ['='], values: ['Aberta', 'Fechada'], src: 'Sensor' },
  bloqueio: { label: 'Bloqueio', ops: ['='], values: ['Ativo', 'Livre'], src: 'Rastreador' },
  panico: { label: 'Botão de pânico', ops: ['='], values: ['Acionado'], src: 'Rastreador' },
  alimentacao: { label: 'Alimentação do rastreador', ops: ['='], values: ['Desconectada', 'Conectada'], src: 'Rastreador' },
  horario: { label: 'Horário', ops: ['depois de', 'antes de'], src: 'Regra da empresa' },
  dia_semana: { label: 'Dia', ops: ['='], values: ['Fim de semana', 'Dia útil'], src: 'Regra da empresa' },
  dentro_cerca: { label: 'Dentro de cerca do tipo', ops: ['='], src: 'Cercas' },
  fora_cerca: { label: 'Fora de cerca do tipo', ops: ['='], src: 'Cercas' },
};

// prioridade do alerta de cerca: configurada na cerca pelo cliente; sem configuração, área de risco é alta
export const fencePriority = (f: any): string => f?.alertPriority || (f?.type === 'Área de risco' ? 'alta' : 'media');
