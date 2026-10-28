export interface RastreadorEntity {
  id: string;
  traccar_device_id: string | null;
  imei: string;
  modelo: string | null;
  /** Modelo do catálogo (`rastreador_modelos`); nulo nos cadastrados antes do catálogo. */
  modelo_id: string | null;
  /** Protocolo DETECTADO na primeira posição (o que o Traccar usou), comparado com o do modelo. */
  protocolo: string | null;
  status: 'cadastrado' | 'ativo' | 'desativado';
  criado_em: Date;
  atualizado_em: Date;
}

export interface RastreadorPainel extends RastreadorEntity {
  vinculo_id: string | null;
  client_id: string | null;
  client_name: string | null;
  vinculado_em: Date | null;
  instalacao_id: string | null;
  asset_id: string | null;
  asset_plate: string | null;
  instalado_em: Date | null;
  sim_card_id: string | null;
  iccid: string | null;
  operadora: string | null;
  ultimo_pacote_em: Date | null;
  modelo_fabricante: string | null;
  modelo_nome: string | null;
  modelo_protocolo: string | null;
  modelo_porta: number | null;
  modelo_tipo_identificador: string | null;
  /** Protocolo detectado diferente do protocolo do modelo (aparelho na porta errada ou modelo errado). */
  protocolo_divergente: boolean;
}
