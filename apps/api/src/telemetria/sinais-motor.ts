/**
 * Sinais de motor / rede CAN (docs/PESQUISA-REDE-CAN.md §§ 4.1, 4.2 e 6): leitura de cada sinal NA POSIÇÃO RECEBIDA e
 * regra que decide o estado do sinal na instalação. Funções puras: a ingestão carrega o estado anterior, chama
 * `avaliarSinal` e grava o resultado (src/telemetria/instalacao-sinais.repository.ts).
 *
 * Regras que valem para tudo aqui:
 * - "Recebido" é o que veio no pacote, nunca o último valor conhecido: a leitura recebe os atributos da posição, nunca
 *   `rastreador_comunicacao.ultimos_atributos` (que junta o último valor de cada chave de propósito). O Traccar da HML
 *   também copia `ignition` da posição anterior (`processing.copyAttributes`), por isso nenhuma regra de falha depende
 *   da ignição: "veículo em operação" é GPS válido e velocidade, que o aparelho mede a cada posição.
 * - `0` ≠ ausente ≠ inválido: RPM 0 é leitura válida; atributo ausente é "não chegou"; valor fora da faixa física é
 *   "chegou inválido".
 * - Mapeamento por modelo (catálogo), nunca regra por protocolo em código — mesma decisão de `leitura.ts`.
 */

export const SINAIS_MOTOR = ['rpm', 'odometro', 'combustivel', 'horimetro'] as const;
export type SinalMotor = (typeof SINAIS_MOTOR)[number];

export const ROTULO_SINAL: Record<SinalMotor, string> = { rpm: 'RPM', odometro: 'odômetro do painel', combustivel: 'combustível', horimetro: 'horímetro' };

export const SUPORTES_CAN = ['nativo', 'com_acessorio', 'nao', 'nao_informado'] as const;
export type SuporteCan = (typeof SUPORTES_CAN)[number];

/**
 * Chave padrão do Traccar para cada sinal (org.traccar.model.Position). `odometer` fica de fora de propósito: é o
 * hodômetro do aparelho (GPS), não o do painel; o do painel é `obdOdometer`. Combustível padrão é o nível em %
 * (`fuelLevel`); aparelho que manda litros (`fuel`) é mapeado no modelo. Horímetro não tem padrão: o `hours` do Traccar
 * é contado pela ignição (o JR12 em bancada, sem veículo, manda `hours`).
 */
export const ATRIBUTO_PADRAO: Record<SinalMotor, string | null> = {
  rpm: 'rpm',
  odometro: 'obdOdometer',
  combustivel: 'fuelLevel',
  horimetro: null,
};

/** Faixa física aceita por sinal, na unidade do Traccar (odômetro em metros, horímetro em ms). Fora dela = inválido. */
const FAIXA: Record<SinalMotor, [min: number, max: number]> = {
  rpm: [0, 12_000],
  odometro: [0, 1e10], // 10 milhões de km
  combustivel: [0, 2_000], // % ou litros, conforme o atributo do modelo
  horimetro: [0, 1e12],
};

export interface MapeamentoSinais {
  suporteCan: SuporteCan;
  /** Sinais que o modelo promete entregar; só esses podem ser cobrados como "não recebido" sem histórico. */
  sinaisMotor: readonly SinalMotor[];
  atributos: Record<SinalMotor, string | null>;
}

export const SEM_MAPEAMENTO_SINAIS: MapeamentoSinais = {
  suporteCan: 'nao_informado',
  sinaisMotor: [],
  atributos: { rpm: null, odometro: null, combustivel: null, horimetro: null },
};

/** Colunas de `rastreador_modelos` (left join: modelo ausente vira tudo null = padrão, suporte não informado). */
export const mapeamentoSinaisDaLinha = (r: {
  suporte_can: string | null; sinais_motor: string[] | null;
  atributo_rpm: string | null; atributo_odometro: string | null; atributo_combustivel: string | null; atributo_horimetro: string | null;
}): MapeamentoSinais => ({
  suporteCan: (SUPORTES_CAN as readonly string[]).includes(r.suporte_can ?? '') ? (r.suporte_can as SuporteCan) : 'nao_informado',
  sinaisMotor: (r.sinais_motor ?? []).filter((s): s is SinalMotor => (SINAIS_MOTOR as readonly string[]).includes(s)),
  atributos: { rpm: r.atributo_rpm, odometro: r.atributo_odometro, combustivel: r.atributo_combustivel, horimetro: r.atributo_horimetro },
});

export type LeituraSinal =
  | { tipo: 'valida'; atributo: string; valor: number }
  | { tipo: 'invalida'; atributo: string; bruto: string }
  | { tipo: 'ausente'; atributo: string }
  /** Sinal sem chave padrão e sem atributo no modelo: não há onde procurar. */
  | { tipo: 'sem_atributo' };

const bruto = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v) : String(v)).slice(0, 40);

/** Lê um sinal dos atributos DESTA posição com o mapeamento do modelo. */
export function lerSinal(attributes: Record<string, unknown> | null | undefined, sinal: SinalMotor, m: MapeamentoSinais = SEM_MAPEAMENTO_SINAIS): LeituraSinal {
  const atributo = m.atributos[sinal] || ATRIBUTO_PADRAO[sinal];
  if (!atributo) return { tipo: 'sem_atributo' };
  const a = attributes ?? {};
  if (!Object.prototype.hasOwnProperty.call(a, atributo) || a[atributo] === null || a[atributo] === undefined) return { tipo: 'ausente', atributo };
  const v = a[atributo];
  const [min, max] = FAIXA[sinal];
  // número de tipo errado (texto "1850") também é inválido: o decoder do Traccar grava número
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return { tipo: 'invalida', atributo, bruto: bruto(v) };
  return { tipo: 'valida', atributo, valor: v };
}

export type StatusSinal = 'recebido' | 'aguardando' | 'nao_recebido' | 'fora_do_esperado';

export interface EstadoSinal {
  status: StatusSinal;
  motivo: string;
  ultimoValor: number | null;
  ultimaLeituraEm: Date | null;
  ultimoRecebimentoEm: Date | null;
  atributoOrigem: string | null;
  semSinalEmOperacao: number;
  avaliadoAte: Date;
}

export interface ContextoPosicao {
  fixTime: Date;
  serverTime: Date;
  gpsValido: boolean;
  velocidadeKmh: number | null;
}

/** Abaixo disso o veículo pode estar parado de motor ligado ou desligado: ausência de sinal não conta. */
export const VELOCIDADE_OPERACAO_KMH = 5;

/**
 * Posições seguidas em movimento sem o sinal para virar "não recebido". Provisório até a prova de conceito com
 * payload real (docs/PESQUISA-REDE-CAN.md § 6.3): combustível tolera mais porque nem todo pacote traz o nível.
 */
export const POSICOES_PARA_NAO_RECEBIDO: Record<SinalMotor, number> = { rpm: 5, odometro: 5, combustivel: 15, horimetro: 10 };

const emOperacao = (c: ContextoPosicao) => c.gpsValido && c.velocidadeKmh !== null && c.velocidadeKmh >= VELOCIDADE_OPERACAO_KMH;

/**
 * Próximo estado do sinal na instalação. `null` = nada a gravar (pacote atrasado, ou sinal que o modelo não promete,
 * nunca chegou e continua sem chegar — modelo sem ficha não é cobrado).
 *
 * - Leitura válida → recebido (inclusive 0), zera a contagem.
 * - Leitura inválida → fora do esperado; a última leitura válida continua guardada.
 * - Ausente com o veículo parado, sem GPS ou só de ignição ligada → não conta (motor pode estar desligado; falha de
 *   comunicação não é falha de CAN).
 * - Ausente com o veículo em movimento → conta; ao atingir o limite vira "não recebido" se o modelo promete o sinal ou
 *   se ele já chegou antes (parou de chegar).
 */
export function avaliarSinal(
  sinal: SinalMotor,
  anterior: EstadoSinal | null,
  leitura: LeituraSinal,
  ctx: ContextoPosicao,
  esperado: boolean,
): EstadoSinal | null {
  if (anterior && ctx.fixTime.getTime() <= anterior.avaliadoAte.getTime()) return null;
  const base = anterior ?? {
    status: 'aguardando' as StatusSinal,
    motivo: '',
    ultimoValor: null,
    ultimaLeituraEm: null,
    ultimoRecebimentoEm: null,
    atributoOrigem: null,
    semSinalEmOperacao: 0,
    avaliadoAte: ctx.fixTime,
  };

  if (leitura.tipo === 'valida') {
    return {
      status: 'recebido',
      motivo: `Recebido em ${leitura.atributo}`,
      ultimoValor: leitura.valor,
      ultimaLeituraEm: ctx.fixTime,
      ultimoRecebimentoEm: ctx.serverTime,
      atributoOrigem: leitura.atributo,
      semSinalEmOperacao: 0,
      avaliadoAte: ctx.fixTime,
    };
  }

  if (leitura.tipo === 'invalida') {
    return {
      ...base,
      status: 'fora_do_esperado',
      motivo: `Valor fora do esperado em ${leitura.atributo}: ${leitura.bruto}`,
      atributoOrigem: leitura.atributo,
      semSinalEmOperacao: 0,
      avaliadoAte: ctx.fixTime,
    };
  }

  // nunca chegou e o modelo não promete: não cria linha (não cobra o que não foi confirmado)
  if (!anterior && !esperado) return null;

  if (leitura.tipo === 'sem_atributo') {
    return {
      ...base,
      status: 'aguardando',
      motivo: 'O modelo não diz em que atributo o aparelho manda este dado (configurar no catálogo)',
      avaliadoAte: ctx.fixTime,
    };
  }

  if (!emOperacao(ctx)) {
    return {
      ...base,
      // sem linha ainda: espera o veículo andar para conferir
      motivo: anterior ? base.motivo : 'Aguardando o veículo em movimento para conferir',
      avaliadoAte: ctx.fixTime,
    };
  }

  const semSinal = base.semSinalEmOperacao + 1;
  const limite = POSICOES_PARA_NAO_RECEBIDO[sinal];
  const cobravel = esperado || base.ultimaLeituraEm !== null;
  if (semSinal >= limite && cobravel) {
    return {
      ...base,
      status: 'nao_recebido',
      motivo: base.ultimaLeituraEm
        ? `Parou de chegar: ${semSinal} posições em movimento sem ${leitura.atributo}`
        : `Não chegou em ${semSinal} posições com o veículo em movimento (atributo ${leitura.atributo})`,
      atributoOrigem: leitura.atributo,
      semSinalEmOperacao: semSinal,
      avaliadoAte: ctx.fixTime,
    };
  }
  return {
    ...base,
    motivo: anterior ? base.motivo : 'Aguardando o veículo em movimento para conferir',
    semSinalEmOperacao: semSinal,
    avaliadoAte: ctx.fixTime,
  };
}
