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
