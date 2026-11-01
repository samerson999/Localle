/**
 * Contrato do canal de tempo real API → front (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.2). Só tipos:
 * a API publica, o front consome, e os dois precisam do mesmo formato.
 *
 * Ordem de entrega numa conexão: um `snapshot` (estado atual da frota), depois os `evento`s persistidos
 * desde o `since` informado pelo front (pub/sub não tem replay, § 5.2 item 5), depois incrementais.
 */
/**
 * Telemetria do aparelho, já na mesma unidade para qualquer protocolo (a leitura é da API, pelas chaves padrão
 * do Traccar e o mapeamento do modelo: apps/api/src/telemetria/leitura.ts). `null` = o aparelho/protocolo não informa — a tela mostra
 * "não informado", nunca um valor de exemplo.
 */
export interface Telemetria {
  /** Tensão da alimentação externa (bateria do veículo), em volts. */
  tensaoV: number | null;
  satelites: number | null;
  /** Sinal da rede celular normalizado de 0 a 5. */
  sinalGsm: number | null;
  bloqueado: boolean | null;
}

export interface RealtimePosicao {
  kind: 'posicao';
  assetId: string;
  rastreadorId: string;
  fixTime: string;
  lat: number;
  lon: number;
  speedKmh: number | null;
  ignition: boolean | null;
  telemetria?: Telemetria;
}

export interface RealtimeEvento {
  kind: 'evento';
  id: string;
  assetId: string | null;
  tipo: string;
  ts: string;
  /** Ex.: cerca (`cercaId`, `nome`, `tipo`) em `cerca_entrada`/`cerca_saida`. */
  attributes?: Record<string, unknown>;
}

/** Alerta do monitoramento — criado e tratado no backend (GET /alertas devolve o mesmo formato). */
export interface Alerta {
  id: string;
  assetId: string | null;
  origem: 'aparelho' | 'cerca' | 'regra';
  tipo: string;
  titulo: string;
  detalhe: string | null;
  prioridade: 'alta' | 'media' | 'baixa';
  ts: string;
  lidoEm: string | null;
  tratadoEm: string | null;
  /** E-mail de quem tratou. */
  tratadoPor: string | null;
  motivo: string | null;
  obs: string | null;
}

/** Alerta novo ou atualizado (lido/tratado por outro usuário): o front substitui pelo `id`. */
export interface RealtimeAlerta {
  kind: 'alerta';
  alerta: Alerta;
}

export interface RealtimeSnapshot {
  kind: 'snapshot';
  posicoes: RealtimePosicao[];
}

export type ComandoTipo = 'engineStop' | 'engineResume' | 'positionSingle';

/**
 * Estados auditáveis de um comando (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.6). `expirado` e
 * `cancelado` são decisões do backend, não do aparelho: nunca apresentar como "veículo liberado".
 */
/** `respondido`: o aparelho respondeu, falta o estado de bloqueio confirmar (ainda pendente). `recusado`: a resposta indica falha. */
export type ComandoStatus = 'solicitado' | 'enviado' | 'aguardando' | 'respondido' | 'confirmado' | 'recusado' | 'falhou' | 'expirado' | 'cancelado';

export interface Comando {
  id: string;
  assetId: string;
  rastreadorId: string;
  tipo: ComandoTipo;
  status: ComandoStatus;
  motivo: string | null;
  /** E-mail de quem solicitou. */
  solicitadoPor: string | null;
  solicitadoEm: string;
  enviadoEm: string | null;
  resolvidoEm: string | null;
  expiraEm: string;
  resultado: Record<string, unknown> | null;
}

/** Mudança de estado de um comando: o front substitui pelo `id`. */
export interface RealtimeComandoStatus {
  kind: 'comando_status';
  comando: Comando;
}

/** Comunicação do rastreador instalado no ativo (regra "sem sinal" do backend, com o limite do cliente). */
export type ComunicacaoStatus = 'sem_rastreador' | 'aguardando' | 'online' | 'sem_gps' | 'sem_sinal';

/**
 * Comunicação da frota inteira, recalculada periodicamente pelo backend: aparelho que para de transmitir não gera
 * posição, então a virada para "sem sinal" só chega por aqui. `fixTime` é a última posição que o cálculo viu — se
 * o front já tem posição mais nova do ativo, o item está velho e é ignorado.
 */
export interface RealtimeComunicacao {
  kind: 'comunicacao';
  ativos: { assetId: string; comunicacao: ComunicacaoStatus; fixTime: string | null }[];
}

export type RealtimeMessage = RealtimePosicao | RealtimeEvento | RealtimeSnapshot | RealtimeAlerta | RealtimeComandoStatus | RealtimeComunicacao;
