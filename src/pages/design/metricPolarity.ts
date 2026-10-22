// DEMONSTRAÇÃO ISOLADA — proposta de contrato centralizado de polaridade de métricas.
// Vive só em src/pages/design/, não é consumida por nenhuma tela de produto nem substitui
// cálculo ou configuração real. Ver docs/design-audit/07-refinamento-kpi.md (seção "Contrato de polaridade").
//
// Objetivo: tirar do componente visual a decisão de "isso é bom ou ruim" — o componente só lê o
// resultado já classificado por este contrato, a partir do tipo da métrica, da direção desejável
// e de como a meta (quando existe) deve ser lida.

export type MetricType = 'volume' | 'eficiencia' | 'custo' | 'disponibilidade' | 'ocorrencia';
export type MetricDirection = 'up' | 'down' | 'neutral'; // subir é bom, descer é bom, ou não há "bom"
export type GoalKind = 'min' | 'max' | 'faixa'; // meta mínima, meta teto, ou faixa aceitável
export type Polarity = 'favoravel' | 'desfavoravel' | 'neutro';

export interface MetricContract {
  id: string;
  label: string;
  unit?: string;
  type: MetricType;
  direction: MetricDirection;
  digits: number;
  // como a meta (se houver) deve ser interpretada; ausente = métrica nunca tem meta própria
  goalKind?: GoalKind;
  goalSource?: string; // onde a meta é configurada (Setup, herança de parâmetro etc.)
  // o que mostrar quando NÃO há meta configurada para esta métrica neste cliente/período
  noGoalBehavior: string;
  // o que mostrar quando falta dado (período sem lançamento, veículo sem leitura etc.)
  missingDataBehavior: string;
}

export interface MetricReading {
  value: number | null;
  goal?: number | null;
}

export interface MetricEvaluation {
  polarity: Polarity;
  deviation: number | null; // value - goal (direção bruta, não normalizada)
  deviationPct: number | null;
  reason: string; // frase curta, usada como leitura acessível (não depende só da cor)
}

// Classifica uma leitura segundo o contrato da métrica. Não calcula nada de negócio — só interpreta
// o par (valor, meta) que a tela já calculou, usando a regra de direção/tipo de meta do contrato.
export function evaluateMetric(contract: MetricContract, reading: MetricReading): MetricEvaluation {
  const { value, goal } = reading;
  if (value == null) return { polarity: 'neutro', deviation: null, deviationPct: null, reason: contract.missingDataBehavior };

  // sem meta: indicadores de volume (e qualquer métrica sem goalKind) são neutros por padrão —
  // a existência de uma meta é o que habilita a leitura de bom/ruim, não o tipo da métrica sozinho
  if (goal == null || contract.direction === 'neutral' || !contract.goalKind) {
    return { polarity: 'neutro', deviation: null, deviationPct: null, reason: contract.noGoalBehavior };
  }

  const deviation = value - goal;
  const deviationPct = goal !== 0 ? (deviation / Math.abs(goal)) * 100 : null;
  const aboveIsGood = contract.direction === 'up';
  const favoravel = contract.goalKind === 'faixa'
    ? deviation === 0
    : aboveIsGood ? value >= goal : value <= goal;
  const polarity: Polarity = deviation === 0 ? 'neutro' : favoravel ? 'favoravel' : 'desfavoravel';
  const ladoMeta = contract.goalKind === 'min' ? 'mínima' : contract.goalKind === 'max' ? 'máxima' : 'de faixa';
  const reason = polarity === 'neutro' ? 'Exatamente na meta.'
    : `${favoravel ? 'Dentro' : 'Fora'} da meta ${ladoMeta} (${aboveIsGood ? 'quanto maior, melhor' : 'quanto menor, melhor'}).`;
  return { polarity, deviation, deviationPct, reason };
}

// ---------- três situações de demonstração pedidas no briefing ----------

// 1) volume: neutro por padrão, sem meta — contar viagens não é "bom" nem "ruim" por si só
export const DEMO_VOLUME: MetricContract = {
  id: 'viagens-mes', label: 'Viagens no mês', type: 'volume', direction: 'neutral', digits: 0,
  noGoalBehavior: 'Indicador de volume: mostra só o valor e a variação neutra (cinza), sem leitura de bom/ruim.',
  missingDataBehavior: 'Sem viagens registradas no período.',
};

// 2) eficiência com meta mínima: quanto maior, melhor; favorável quando valor ≥ meta
export const DEMO_EFICIENCIA_META_MINIMA: MetricContract = {
  id: 'consumo-kml', label: 'Consumo médio', unit: 'km/L', type: 'eficiencia', direction: 'up', digits: 1,
  goalKind: 'min', goalSource: 'Setup › Combustível › Meta de consumo por categoria',
  noGoalBehavior: 'Sem meta configurada para esta categoria: mostra o valor e a variação vs. período anterior, neutra.',
  missingDataBehavior: 'Sem abastecimento suficiente no período para calcular o consumo.',
};

// 3) custo com meta máxima (teto): quanto menor, melhor; favorável quando valor ≤ meta
export const DEMO_CUSTO_META_MAXIMA: MetricContract = {
  id: 'custo-km', label: 'Custo por km', unit: 'R$', type: 'custo', direction: 'down', digits: 2,
  goalKind: 'max', goalSource: 'Setup › Manutenção › Teto de custo por km (herdado da revenda)',
  noGoalBehavior: 'Sem teto configurado: mostra o valor e a variação vs. período anterior, neutra.',
  missingDataBehavior: 'Sem km rodado no período.',
};

export const DEMO_CONTRACTS = [DEMO_VOLUME, DEMO_EFICIENCIA_META_MINIMA, DEMO_CUSTO_META_MAXIMA];
