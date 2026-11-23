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
  papel: 'principal' | 'backup' | 'can' | null;
  tipo_aparelho: 'rastreador' | 'tag';
  /** O modelo aceita leitor de cartão do motorista; `leitor_motorista` = leitor marcado na instalação vigente. */
  modelo_aceita_leitor: boolean;
  leitor_motorista: boolean;
  /** Última posição válida desde a instalação vigente (a ficha mostra a do backup, que não vai para o mapa). */
  posicao_em: Date | null;
  latitude: number | null;
  longitude: number | null;
  ultimo_pacote_em: Date | null;
}

/** Backup do ativo para o card do Monitoramento: só o aparelho e a última posição desde a instalação vigente. */
export type BackupDoAtivo = Pick<RastreadorDoCliente, 'imei' | 'modelo' | 'tipo_aparelho' | 'posicao_em' | 'latitude' | 'longitude' | 'ultimo_pacote_em'>;
