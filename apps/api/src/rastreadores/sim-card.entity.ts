export interface SimCardEntity {
  id: string;
  iccid: string;
  operadora: string | null;
  numero: string | null;
  status: 'estoque' | 'ativo' | 'inativo';
  rastreador_id: string | null;
  criado_em: Date;
  atualizado_em: Date;
}
