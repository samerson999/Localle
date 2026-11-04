import type { TipoIdentificador } from '@localle/shared/rastreadorModelos';
import type { SinalMotor, SuporteCan } from '../telemetria/sinais-motor';

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
  /** Sinais de motor / CAN (src/telemetria/sinais-motor.ts): capacidade do modelo e onde manda cada sinal. */
  suporte_can: SuporteCan;
  sinais_motor: SinalMotor[];
  atributo_rpm: string | null;
  atributo_odometro: string | null;
  atributo_combustivel: string | null;
  atributo_horimetro: string | null;
  /** 'catalogo' = mantido pela Localle (migration 1793160000000); 'manual' = cadastrado pela tela. */
  origem: 'catalogo' | 'manual';
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
}
