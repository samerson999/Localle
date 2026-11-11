export type AssetStatus = 'ativo' | 'vendido' | 'baixado';

export interface AssetEntity {
  id: string;
  client_id: string;
  /** Placa de verdade; nulo em ativo sem placa (linha amarela, equipamento). */
  plate: string | null;
  /** Código interno ou nº de série. Todo ativo tem placa ou identificador. */
  identificador: string | null;
  /** Gerada pelo banco: placa, ou o identificador quando não há placa — o nome que relatórios e mapa mostram. */
  rotulo: string;
  status: AssetStatus;
  status_desde: Date;
  motorista_id: string | null;
  /** Ícone ilustrado do catálogo do front (png-tight), ex.: "02-sedan"; null = silhueta da categoria. */
  icone: string | null;
  /** Ficha do cadastro (formato do front: tipo, marca/modelo, ficha técnica, documentos, metas…); sem arquivos. */
  dados: Record<string, unknown>;
  operacao_id: string | null;
  /** Modelo da lista do cliente (ativo_modelos); a marca vem do modelo. */
  modelo_id: string | null;
  created_at: Date;
  updated_at: Date;
}
