export type AssetStatus = 'ativo' | 'vendido' | 'baixado';

export interface AssetEntity {
  id: string;
  client_id: string;
  plate: string;
  status: AssetStatus;
  status_desde: Date;
  created_at: Date;
  updated_at: Date;
}
