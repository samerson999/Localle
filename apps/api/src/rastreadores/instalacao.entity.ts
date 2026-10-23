export interface InstalacaoEntity {
  id: string;
  client_id: string;
  rastreador_id: string;
  asset_id: string;
  papel: 'principal' | 'secundario' | 'can';
  instalado_em: Date;
  desinstalado_em: Date | null;
  tecnico: string;
  km_inicial: string | null;
  foto: string | null;
}
