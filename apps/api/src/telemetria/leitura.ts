import type { Telemetria } from '@localle/shared/realtime';

/** Mapeamento do modelo (`rastreador_modelos`); campo vazio = chave padrão do Traccar. */
export interface MapeamentoTelemetria {
  atributoTensao: string | null;
  sinalMax: number | null;
  atributoBloqueio: string | null;
}

export const SEM_MAPEAMENTO: MapeamentoTelemetria = { atributoTensao: null, sinalMax: null, atributoBloqueio: null };

/** Colunas de `rastreador_modelos` (left join: modelo ausente vira tudo null = padrão). */
export const mapeamentoDaLinha = (r: { atributo_tensao: string | null; sinal_max: number | null; atributo_bloqueio: string | null }): MapeamentoTelemetria => ({
  atributoTensao: r.atributo_tensao,
  sinalMax: r.sinal_max,
  atributoBloqueio: r.atributo_bloqueio,
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
  return {
    tensaoV: volts(a[m.atributoTensao || 'power']),
    satelites: inteiro(a.sat, 0, 64),
    sinalGsm: escala(a.rssi, m.sinalMax || 5),
    bloqueado: booleano(a[m.atributoBloqueio || 'blocked']),
  };
}

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
  return {
    ...lerTelemetria(attributes, m),
    lidaEm: { tensaoV: em(m.atributoTensao || 'power'), satelites: em('sat'), sinalGsm: em('rssi'), bloqueado: em(m.atributoBloqueio || 'blocked') },
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

function inteiro(v: unknown, min: number, max: number) {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Converte a escala do aparelho (0..max) para 0..5; fora da escala (ex.: dBm negativo) = não informado. */
function escala(v: unknown, max: number) {
  const n = inteiro(v, 0, max);
  return n === null ? null : Math.round((n * 5) / max);
}
