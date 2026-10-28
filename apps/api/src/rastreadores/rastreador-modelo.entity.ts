import type { TipoIdentificador } from '@localle/shared/rastreadorModelos';

export interface RastreadorModeloEntity {
  id: string;
  fabricante: string;
  nome: string;
  protocolo: string;
  porta: number;
  tipo_identificador: TipoIdentificador;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
}
