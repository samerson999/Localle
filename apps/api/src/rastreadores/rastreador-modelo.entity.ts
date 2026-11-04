import type { TipoIdentificador } from '@localle/shared/rastreadorModelos';

export interface RastreadorModeloEntity {
  id: string;
  fabricante: string;
  nome: string;
  protocolo: string;
  porta: number;
  tipo_identificador: TipoIdentificador;
  /** Mapeamento da telemetria (apps/api/src/telemetria/leitura.ts); null = chave padrão do Traccar. */
  atributo_tensao: string | null;
  sinal_max: number | null;
  atributo_bloqueio: string | null;
  /** 'catalogo' = mantido pela Localle (migration 1793160000000); 'manual' = cadastrado pela tela. */
  origem: 'catalogo' | 'manual';
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
}
