/**
 * Contrato do canal de tempo real API → front (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 5.2). Só tipos:
 * a API publica, o front consome, e os dois precisam do mesmo formato.
 *
 * Ordem de entrega numa conexão: um `snapshot` (estado atual da frota), depois os `evento`s persistidos
 * desde o `since` informado pelo front (pub/sub não tem replay, § 5.2 item 5), depois incrementais.
 */
export interface RealtimePosicao {
  kind: 'posicao';
  assetId: string;
  rastreadorId: string;
  fixTime: string;
  lat: number;
  lon: number;
  speedKmh: number | null;
  ignition: boolean | null;
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
export type ComandoStatus = 'solicitado' | 'enviado' | 'aguardando' | 'confirmado' | 'falhou' | 'expirado' | 'cancelado';

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

export type RealtimeMessage = RealtimePosicao | RealtimeEvento | RealtimeSnapshot | RealtimeAlerta | RealtimeComandoStatus;
