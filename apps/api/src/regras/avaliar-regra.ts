export type CampoRegra =
  | 'velocidade'
  | 'ignicao'
  | 'bateria'
  | 'temperatura'
  | 'porta'
  | 'bloqueio'
  | 'panico'
  | 'alimentacao'
  | 'horario'
  | 'dia_semana'
  | 'dentro_cerca'
  | 'fora_cerca'
  // estado lido do rastreador (src/telemetria/leitura.ts, com o mapeamento do modelo): alertas da plataforma
  | 'tensao'
  | 'satelites'
  | 'sinal_gsm'
  | 'atributo';

export interface Condicao {
  field: CampoRegra;
  op: string;
  value: string;
  /** Só `atributo`: chave crua do Traccar (ex.: in1, io239, fuel). */
  attr?: string;
}

/** Operadores e valores aceitos por campo — o mesmo catálogo de RULE_FIELDS (packages/shared/src/engine.ts). */
export const CAMPOS: Record<CampoRegra, { ops: string[]; values?: string[]; numerico?: boolean; hora?: boolean }> = {
  velocidade: { ops: ['>', '<'], numerico: true },
  ignicao: { ops: ['='], values: ['Ligada', 'Desligada'] },
  bateria: { ops: ['<', '>'], numerico: true },
  temperatura: { ops: ['>', '<'], numerico: true },
  porta: { ops: ['='], values: ['Aberta', 'Fechada'] },
  bloqueio: { ops: ['='], values: ['Ativo', 'Livre'] },
  panico: { ops: ['='], values: ['Acionado'] },
  alimentacao: { ops: ['='], values: ['Desconectada', 'Conectada'] },
  horario: { ops: ['depois de', 'antes de'], hora: true },
  dia_semana: { ops: ['='], values: ['Fim de semana', 'Dia útil'] },
  dentro_cerca: { ops: ['='] },
  fora_cerca: { ops: ['='] },
  tensao: { ops: ['<', '>'], numerico: true },
  satelites: { ops: ['<', '>'], numerico: true },
  sinal_gsm: { ops: ['<', '>'], numerico: true },
  atributo: { ops: ['=', '≠', '>', '<'] },
};

/** Campos que um alerta da plataforma (Console › Tipos de alerta) pode usar: estado do rastreador, sem cerca do cliente. */
export const CAMPOS_PLATAFORMA: CampoRegra[] = ['tensao', 'alimentacao', 'bloqueio', 'ignicao', 'velocidade', 'satelites', 'sinal_gsm', 'temperatura', 'porta', 'atributo', 'horario', 'dia_semana'];

export interface ContextoRegra {
  fixTime: Date;
  speedKmh: number | null;
  ignition: boolean | null;
  /** Tipos das cercas em que o ativo está agora (cerca_presenca). */
  tiposCercaDentro: string[];
  alarms: string[];
  attributes: Record<string, unknown>;
  /** Alimentação externa pela leitura da telemetria (src/telemetria/leitura.ts); null = o aparelho não informa. */
  alimentacaoExterna?: boolean | null;
  /** Leitura do estado com o mapeamento do modelo (tensão, satélites, sinal, bloqueio); ausente = não lido. */
  telemetria?: { tensaoV: number | null; satelites: number | null; sinalGsm: number | null; bloqueado: boolean | null };
}

/** `atributo`: número compara como número, booleano como "true"/"false", o resto como texto. Ausente = falso. */
function atributoAtende(c: Condicao, attributes: Record<string, unknown>): boolean {
  if (!c.attr || !Object.prototype.hasOwnProperty.call(attributes, c.attr)) return false;
  const v = attributes[c.attr];
  if (v === null || v === undefined) return false;
  if (c.op === '>' || c.op === '<') {
    const atual = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
    const alvo = Number(c.value);
    if (atual === null || !Number.isFinite(alvo)) return false;
    return c.op === '>' ? atual > alvo : atual < alvo;
  }
  const igual = typeof v === 'number' && /^-?\d+(\.\d+)?$/.test(c.value) ? v === Number(c.value) : String(v) === c.value;
  return c.op === '=' ? igual : c.op === '≠' ? !igual : false;
}

/** Horário e dia são regra da empresa: valem no fuso da operação, não em UTC. */
export const FUSO_PADRAO = 'America/Recife';

function horaLocal(d: Date, fuso: string): { minutos: number; fimDeSemana: boolean } {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: fuso, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const h = Number(get('hour')) % 24; // "24" à meia-noite em alguns runtimes
  return { minutos: h * 60 + Number(get('minute')), fimDeSemana: ['Sat', 'Sun'].includes(get('weekday')) };
}

const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * Mesma semântica do `evalRule` da simulação, sobre o que chega na posição do Traccar. Dado ausente
 * (rastreador que não manda temperatura, porta, tensão…) torna a condição falsa — nunca dispara alerta
 * por falta de informação.
 */
export function condicaoAtende(c: Condicao, ctx: ContextoRegra, fuso = FUSO_PADRAO): boolean {
  const { minutos, fimDeSemana } = horaLocal(ctx.fixTime, fuso);
  const n = Number(c.value);
  const compara = (atual: number | null) => (atual === null ? false : c.op === '>' ? atual > n : atual < n);
  switch (c.field) {
    case 'velocidade':
      return compara(ctx.speedKmh);
    case 'ignicao':
      return ctx.ignition !== null && (c.value === 'Ligada') === ctx.ignition;
    case 'bateria':
      return compara(numero(ctx.attributes.power));
    case 'temperatura':
      return compara(numero(ctx.attributes.temp1));
    case 'porta':
      return typeof ctx.attributes.door === 'boolean' && (c.value === 'Aberta') === ctx.attributes.door;
    case 'bloqueio': {
      // leitura pelo mapeamento do modelo quando houver; senão o `blocked` do Traccar, como antes
      const b = typeof ctx.telemetria?.bloqueado === 'boolean' ? ctx.telemetria.bloqueado : ctx.attributes.blocked;
      return typeof b === 'boolean' && (c.value === 'Ativo') === b;
    }
    case 'tensao':
      return compara(ctx.telemetria?.tensaoV ?? null);
    case 'satelites':
      return compara(ctx.telemetria?.satelites ?? null);
    case 'sinal_gsm':
      return compara(ctx.telemetria?.sinalGsm ?? null);
    case 'atributo':
      return atributoAtende(c, ctx.attributes);
    case 'panico':
      return ctx.alarms.includes('sos');
    case 'alimentacao': {
      // alarme do aparelho ou estado lido (aparelho sem alarme powerCut, como o teltonika). Sem leitura, "Conectada"
      // continua valendo como antes da leitura existir, para não mudar regra já configurada.
      const cortada = ctx.alarms.includes('powerCut') || ctx.alimentacaoExterna === false;
      return (c.value === 'Desconectada') === cortada;
    }
    case 'horario':
      return c.op === 'depois de' ? minutos >= toMin(c.value) : minutos < toMin(c.value);
    case 'dia_semana':
      return (c.value === 'Fim de semana') === fimDeSemana;
    case 'dentro_cerca':
      return ctx.tiposCercaDentro.includes(c.value);
    case 'fora_cerca':
      return !ctx.tiposCercaDentro.includes(c.value);
    default:
      return false;
  }
}

/** Todas as condições precisam ser verdadeiras (e regra sem condição nunca dispara). */
export function regraAtende(condicoes: Condicao[], ctx: ContextoRegra, fuso = FUSO_PADRAO): boolean {
  return condicoes.length > 0 && condicoes.every((c) => condicaoAtende(c, ctx, fuso));
}
