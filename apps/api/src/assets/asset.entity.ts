export type AssetStatus = 'ativo' | 'vendido' | 'baixado';

export interface AssetEntity {
  id: string;
  client_id: string;
  plate: string;
  status: AssetStatus;
  status_desde: Date;
  motorista_id: string | null;
  /** Ícone ilustrado do catálogo do front (png-tight), ex.: "02-sedan"; null = silhueta da categoria. */
  icone: string | null;
  created_at: Date;
  updated_at: Date;
}
