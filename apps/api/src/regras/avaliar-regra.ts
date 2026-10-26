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
  | 'fora_cerca';

export interface Condicao {
  field: CampoRegra;
  op: string;
  value: string;
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
};

export interface ContextoRegra {
  fixTime: Date;
  speedKmh: number | null;
  ignition: boolean | null;
  /** Tipos das cercas em que o ativo está agora (cerca_presenca). */
  tiposCercaDentro: string[];
  alarms: string[];
  attributes: Record<string, unknown>;
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
    case 'bloqueio':
      return typeof ctx.attributes.blocked === 'boolean' && (c.value === 'Ativo') === ctx.attributes.blocked;
    case 'panico':
      return ctx.alarms.includes('sos');
    case 'alimentacao':
      return (c.value === 'Desconectada') === ctx.alarms.includes('powerCut');
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
