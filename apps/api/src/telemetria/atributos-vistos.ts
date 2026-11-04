import type { MapeamentoTelemetria } from './leitura';
import { ATRIBUTO_PADRAO, type MapeamentoSinais, ROTULO_SINAL, SINAIS_MOTOR } from './sinais-motor';

/**
 * Quando cada atributo chegou pela última vez e mudanças de formato que passariam despercebidas (decisão de 04/11/2026,
 * migration 1793190000000). Caso que motivou: o Traccar 6.17 trocou a chave da tensão do JR12 de `vin` para `power`, e
 * a plataforma seguiu lendo o `vin` antigo sem nenhum aviso.
 *
 * - Atributo NOVO (nunca visto neste rastreador, que já tinha histórico): sinal de decoder/firmware/configuração
 *   diferente. Vira log.
 * - Atributo que a plataforma LÊ e parou de chegar há `AUSENCIA_PARA_AVISO_MIN` minutos de transmissão (aparelho
 *   desligado não conta: a ausência começa no primeiro pacote sem a chave). Vira aviso uma vez, na passagem do limite.
 *   Só chave lida: chave esporádica (`alarm`, `event`, `io252`…) falta na maioria dos pacotes e geraria ruído.
 */
export const AUSENCIA_PARA_AVISO_MIN = 60;

/** Datas como o banco guarda no jsonb (ISO). */
export type DatasPorChave = Record<string, string>;

export interface EstadoAtributos {
  vistosEm: DatasPorChave;
  ausentesDesde: DatasPorChave;
  /** server_time do pacote mais novo já recebido (`rastreador_comunicacao.atributos_em`). */
  atributosEm: Date | null;
}

export interface AcompanhamentoAtributos {
  vistosEm: DatasPorChave;
  ausentesDesde: DatasPorChave;
  novos: string[];
  pararam: { chave: string; leitura: string; desde: string }[];
}

/** Chaves que a plataforma lê → o que lê com ela (mesmas regras de `lerTelemetria` e `lerSinal`). */
export function chavesLidas(m: MapeamentoTelemetria, s: MapeamentoSinais): Map<string, string> {
  const out = new Map<string, string>([
    [m.atributoTensao || 'power', 'tensão'],
    ['sat', 'satélites'],
    ['rssi', 'sinal GSM'],
    [m.atributoBloqueio || 'blocked', 'bloqueio'],
    ['ignition', 'ignição'],
  ]);
  for (const sinal of SINAIS_MOTOR) {
    const chave = s.atributos[sinal] || ATRIBUTO_PADRAO[sinal];
    if (chave) out.set(chave, ROTULO_SINAL[sinal]);
  }
  return out;
}

const ms = (iso: string | undefined) => (iso ? Date.parse(iso) : NaN);

export function acompanharAtributos(
  anterior: EstadoAtributos | null,
  chaves: string[],
  serverTime: Date,
  lidas: Map<string, string>,
): AcompanhamentoAtributos {
  const agora = serverTime.toISOString();
  const vistosAntes = anterior?.vistosEm ?? {};
  const ausentesAntes = anterior?.ausentesDesde ?? {};
  const presentes = new Set(chaves);

  // pacote atrasado/reenviado: só registra que a chave existia naquele instante; não mexe em ausência nem avisa
  if (anterior?.atributosEm && serverTime.getTime() < anterior.atributosEm.getTime()) {
    const vistosEm = { ...vistosAntes };
    for (const k of chaves) if (!(ms(vistosEm[k]) >= serverTime.getTime())) vistosEm[k] = agora;
    return { vistosEm, ausentesDesde: { ...ausentesAntes }, novos: [], pararam: [] };
  }

  const vistosEm = { ...vistosAntes };
  for (const k of chaves) vistosEm[k] = agora;

  const ausentesDesde: DatasPorChave = {};
  for (const k of Object.keys(vistosAntes)) {
    if (!presentes.has(k)) ausentesDesde[k] = ausentesAntes[k] ?? agora;
  }

  // rastreador sem histórico: tudo é "novo", não é mudança
  const novos = Object.keys(vistosAntes).length ? chaves.filter((k) => !(k in vistosAntes)) : [];

  const limite = AUSENCIA_PARA_AVISO_MIN * 60_000;
  const pararam: AcompanhamentoAtributos['pararam'] = [];
  for (const [chave, leitura] of lidas) {
    const desde = ausentesDesde[chave];
    if (!desde) continue;
    const antes = anterior?.atributosEm ? anterior.atributosEm.getTime() - ms(desde) : -1;
    const depois = serverTime.getTime() - ms(desde);
    if (antes < limite && depois >= limite) pararam.push({ chave, leitura, desde });
  }
  return { vistosEm, ausentesDesde, novos, pararam };
}
