export interface InstalacaoEntity {
  id: string;
  client_id: string;
  rastreador_id: string;
  asset_id: string;
  papel: 'principal' | 'backup' | 'can';
  instalado_em: Date;
  desinstalado_em: Date | null;
  tecnico: string;
  km_inicial: string | null;
  foto: string | null;
  /** Leitor de cartão do motorista instalado junto (migration 1794400000000); só conta se o modelo aceita. */
  leitor_motorista: boolean;
}
