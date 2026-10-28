export interface RastreadorVinculoEntity {
  id: string;
  client_id: string;
  rastreador_id: string;
  vinculado_em: Date;
  desvinculado_em: Date | null;
}

/** O que o cliente vê de cada rastreador vinculado a ele: identificação + onde está instalado agora. */
export interface RastreadorDoCliente {
  id: string;
  imei: string;
  modelo: string | null;
  protocolo: string | null;
  vinculado_em: Date;
  instalacao_id: string | null;
  asset_id: string | null;
  asset_plate: string | null;
  instalado_em: Date | null;
  ultimo_pacote_em: Date | null;
}
