export class CreateRastreadorDto {
  /** Identificador que o aparelho manda (IMEI, terminal JT808…), validado pelo tipo do modelo. */
  imei!: string;
  /** Obrigatório: o modelo diz protocolo, porta e o formato do identificador. */
  modeloId!: string;
  traccarDeviceId?: string;
  modelo?: string;
  protocolo?: string;
}
