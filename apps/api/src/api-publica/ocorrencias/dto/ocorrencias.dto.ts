import type { Alerta, Comando } from '@localle/shared/realtime';

/** Alerta: ocorrência (exige tratamento com desfecho) ou aviso (só leitura). */
export class AlertaDto {
  id!: string;
  veiculoId!: string | null;
  /** `aparelho` (alarme do rastreador), `cerca` ou `regra`. */
  origem!: 'aparelho' | 'cerca' | 'regra';
  tipo!: string;
  titulo!: string;
  detalhe!: string | null;
  prioridade!: 'alta' | 'media' | 'baixa';
  /** `true`: ocorrência, fica aberta até ser tratada. `false`: aviso. */
  exigeTratamento!: boolean;
  /** ISO 8601 (UTC). */
  dataHora!: string;
  /** ISO 8601 (UTC). */
  lidoEm!: string | null;
  /** ISO 8601 (UTC); `null` enquanto aberta. */
  tratadoEm!: string | null;
  /** E-mail de quem tratou. */
  tratadoPor!: string | null;
  /** Desfecho informado no tratamento. */
  desfecho!: string | null;
  observacao!: string | null;
}

/** Comando enviado ao rastreador (bloqueio, desbloqueio…). */
export class ComandoDto {
  id!: string;
  veiculoId!: string;
  rastreadorId!: string;
  tipo!: string;
  /** Situação do comando, da solicitação à confirmação do aparelho. */
  situacao!: string;
  motivo!: string | null;
  /** E-mail de quem solicitou. */
  solicitadoPor!: string | null;
  /** ISO 8601 (UTC). */
  solicitadoEm!: string;
  /** ISO 8601 (UTC). */
  enviadoEm!: string | null;
  /** ISO 8601 (UTC). */
  resolvidoEm!: string | null;
}

export class PaginaAlertas {
  dados!: AlertaDto[];
  /** Passe em `cursor` para a próxima página; `null` na última. */
  proximoCursor!: string | null;
}
export class PaginaComandos {
  dados!: ComandoDto[];
  /** Passe em `cursor` para a próxima página; `null` na última. */
  proximoCursor!: string | null;
}

export const paraAlertaDto = (a: Alerta): AlertaDto => ({
  id: a.id,
  veiculoId: a.assetId,
  origem: a.origem,
  tipo: a.tipo,
  titulo: a.titulo,
  detalhe: a.detalhe,
  prioridade: a.prioridade,
  exigeTratamento: a.exigeTratamento,
  dataHora: a.ts,
  lidoEm: a.lidoEm,
  tratadoEm: a.tratadoEm,
  tratadoPor: a.tratadoPor,
  desfecho: a.motivo,
  observacao: a.obs,
});

export const paraComandoDto = (c: Comando): ComandoDto => ({
  id: c.id,
  veiculoId: c.assetId,
  rastreadorId: c.rastreadorId,
  tipo: c.tipo,
  situacao: c.status,
  motivo: c.motivo,
  solicitadoPor: c.solicitadoPor,
  solicitadoEm: c.solicitadoEm,
  enviadoEm: c.enviadoEm,
  resolvidoEm: c.resolvidoEm,
});
