export class CreateRastreadorDto {
  /** Identificador que o aparelho manda (IMEI, terminal JT808…), validado pelo tipo do modelo. */
  imei!: string;
  /** Número de série impresso no aparelho, quando não é o próprio IMEI. */
  numeroSerie?: string | null;
  /** Modelo do catálogo, ou `aparelhoId` (da lista do Traccar: o modelo é criado junto com o rastreador). */
  modeloId?: string;
  aparelhoId?: number;
  traccarDeviceId?: string;
  modelo?: string;
  protocolo?: string;
}
