import type { Telemetria } from '@localle/shared/realtime';
import { lerSinal, SEM_MAPEAMENTO_SINAIS } from './sinais-motor';

/** Mapeamento do modelo (`rastreador_modelos`); campo vazio = chave padrão do Traccar. */
export interface MapeamentoTelemetria {
  atributoTensao: string | null;
  sinalMax: number | null;
  atributoBloqueio: string | null;
  /** Chave do odômetro do painel (CAN) quando o modelo foge do padrão `obdOdometer`. */
  atributoOdometro?: string | null;
}

/**
 * Abaixo disto a alimentação externa está desligada: bateria de veículo ligada nunca fica tão baixa (12 V descarregada
 * ainda tem ~10 V), e o que sobra no fio cortado é ruído do conversor do aparelho (o JR12 de bancada marca 0,7 V).
 */
export const TENSAO_MIN_ALIMENTACAO_V = 6;

export const SEM_MAPEAMENTO: MapeamentoTelemetria = { atributoTensao: null, sinalMax: null, atributoBloqueio: null };

/** Colunas de `rastreador_modelos` (left join: modelo ausente vira tudo null = padrão). */
export const mapeamentoDaLinha = (r: { atributo_tensao: string | null; sinal_max: number | null; atributo_bloqueio: string | null; atributo_odometro?: string | null }): MapeamentoTelemetria => ({
  atributoTensao: r.atributo_tensao,
  sinalMax: r.sinal_max,
  atributoBloqueio: r.atributo_bloqueio,
  atributoOdometro: r.atributo_odometro ?? null,
});

/**
 * Telemetria a partir dos atributos que o Traccar decodifica, para qualquer protocolo: lê as chaves padrão do Traccar
 * (`power` em V, `sat`, `rssi`, `blocked`) e só usa outra chave/escala quando o modelo do catálogo diz (decisão de
 * 01/11/2026: nada de regra por protocolo em código; o modelo fora do padrão é configurado na tela do admin).
 * A unidade é normalizada pela faixa física: tensão acima de 100 só pode estar em mV. Valor impossível vira null
 * ("não informado") em vez de um número falso na tela.
 */
export function lerTelemetria(attributes: Record<string, unknown> | null | undefined, m: MapeamentoTelemetria = SEM_MAPEAMENTO): Telemetria {
  const a = attributes ?? {};
  const tensaoV = volts(a[m.atributoTensao || 'power']);
  return {
    tensaoV,
    satelites: inteiro(a.sat, 0, 64),
    sinalGsm: escala(a.rssi, m.sinalMax || 5),
    bloqueado: booleano(a[m.atributoBloqueio || 'blocked']),
    // a tensão é a leitura direta; `charge` (GT06 e outros sem tensão) é o bit "alimentação externa conectada" do Traccar.
    // O alarme `powerCut` não entra: é evento (já vira alerta) e, no último valor conhecido por chave, ficaria preso.
    alimentacaoExterna: tensaoV !== null ? tensaoV >= TENSAO_MIN_ALIMENTACAO_V : typeof a.charge === 'boolean' ? a.charge : null,
  };
}

/** Chave padrão do Traccar; aparelho sem fio de ignição não manda (null). */
export const ignicaoDosAtributos = (attributes: Record<string, unknown> | null | undefined): boolean | null =>
  typeof attributes?.ignition === 'boolean' ? attributes.ignition : null;

/**
 * `lerTelemetria` + quando chegou o atributo de cada leitura (`rastreador_comunicacao.atributos_vistos_em`). O valor
 * vem do último conhecido de cada chave, que pode ser de dias atrás: a idade é o que deixa isso visível na tela.
 */
export function lerTelemetriaComIdade(
  attributes: Record<string, unknown> | null | undefined,
  vistosEm: Record<string, unknown> | null | undefined,
  m: MapeamentoTelemetria = SEM_MAPEAMENTO,
): Telemetria {
  const v = vistosEm ?? {};
  const em = (chave: string) => (typeof v[chave] === 'string' ? (v[chave] as string) : null);
  const t = lerTelemetria(attributes, m);
  const tensao = m.atributoTensao || 'power';
  // odômetro do painel (CAN): mesma chave e faixa do diagnóstico de sinais (`lerSinal`), para a tela e o diagnóstico
  // nunca discordarem; aparelho sem CAN não manda a chave e fica null
  const odometro = lerSinal(attributes, 'odometro', { ...SEM_MAPEAMENTO_SINAIS, atributos: { ...SEM_MAPEAMENTO_SINAIS.atributos, odometro: m.atributoOdometro ?? null } });
  const odometroValido = odometro.tipo === 'valida';
  const velocidadePainel = faixa((attributes ?? {}).obdSpeed, 0, 300);
  const ignicao = ignicaoDosAtributos(attributes);
  return {
    ...t,
    // ignição do último pacote que a trouxe, com ou sem GPS válido (a da posição na tela é a da última posição válida)
    ignicao,
    odometroPainelKm: odometroValido ? Math.round(odometro.valor / 100) / 10 : null,
    // velocidade do painel: chave padrão do Traccar, em km/h; a tela só mostra quando veio no pacote da posição atual
    velocidadePainelKmh: velocidadePainel,
    lidaEm: {
      tensaoV: em(tensao), satelites: em('sat'), sinalGsm: em('rssi'), bloqueado: em(m.atributoBloqueio || 'blocked'),
      alimentacaoExterna: t.alimentacaoExterna === null ? null : em(t.tensaoV !== null ? tensao : 'charge'),
      odometroPainel: odometroValido ? em(odometro.atributo) : null,
      velocidadePainel: velocidadePainel === null ? null : em('obdSpeed'),
      ignicao: ignicao === null ? null : em('ignition'),
    },
  };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// saída digital vem como boolean na maioria dos decoders e como 0/1 em alguns
const booleano = (v: unknown) => (typeof v === 'boolean' ? v : v === 0 || v === 1 ? v === 1 : null);

function volts(v: unknown) {
  let n = num(v);
  if (n !== null && n > 100 && n <= 60_000) n = n / 1000; // mV
  return n !== null && n >= 0 && n <= 60 ? Math.round(n * 100) / 100 : null;
}

function faixa(v: unknown, min: number, max: number) {
  const n = num(v);
  return n !== null && n >= min && n <= max ? Math.round(n * 10) / 10 : null;
}

function inteiro(v: unknown, min: number, max: number) {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Converte a escala do aparelho (0..max) para 0..5; fora da escala (ex.: dBm negativo) = não informado. */
function escala(v: unknown, max: number) {
  const n = inteiro(v, 0, max);
  return n === null ? null : Math.round((n * 5) / max);
}
