export interface RastreadorEntity {
  id: string;
  traccar_device_id: string | null;
  imei: string;
  modelo: string | null;
  protocolo: string | null;
  status: 'cadastrado' | 'ativo' | 'desativado';
  criado_em: Date;
  atualizado_em: Date;
}

export interface RastreadorPainel extends RastreadorEntity {
  instalacao_id: string | null;
  client_id: string | null;
  client_name: string | null;
  asset_id: string | null;
  asset_plate: string | null;
  instalado_em: Date | null;
  sim_card_id: string | null;
  iccid: string | null;
  operadora: string | null;
  ultimo_pacote_em: Date | null;
}
