import type { MotoristaVinculoRow } from '../../../motoristas/motorista-vinculos.repository';
import type { MotoristaRow } from '../../../motoristas/motoristas.repository';
import type { EstadoVencimento } from '../../../motoristas/vencimentos';
import { iso } from '../../comum/periodo';

/**
 * Motorista. O código do cartão (iButton/RFID) não sai pela API — com ele daria para clonar o cartão; `temCartao` diz
 * se há um cadastrado.
 */
export class MotoristaDto {
  id!: string;
  nome!: string;
  cnh!: string | null;
  cnhCategoria!: string | null;
  /** `YYYY-MM-DD`. */
  cnhValidade!: string | null;
  /** `YYYY-MM-DD`. */
  toxicologicoValidade!: string | null;
  telefone!: string | null;
  temCartao!: boolean;
  /** Regime de jornada. */
  regime!: string;
  /** Exerce atividade remunerada (EAR) na CNH. */
  ear!: boolean;
  ativo!: boolean;
  /** ISO 8601 (UTC). */
  criadoEm!: string;
  /** ISO 8601 (UTC). */
  atualizadoEm!: string;
}

export class SituacaoVencimentoDto {
  /** `YYYY-MM-DD`. */
  validade!: string | null;
  /** `vencido`, `critico`, `atencao`, `ok` ou `sem_data` — pelos prazos configurados no Setup. */
  estado!: EstadoVencimento;
}

/** Motorista com CNH ou toxicológico vencido ou vencendo. */
export class VencimentoDto {
  motoristaId!: string;
  nome!: string;
  cnh!: SituacaoVencimentoDto;
  /** Só para CNH C, D e E; `null` nas demais. */
  toxicologico!: SituacaoVencimentoDto | null;
}

/** Período em que um motorista esteve no veículo. */
export class VinculoDto {
  id!: string;
  veiculoId!: string;
  /** `null`: cartão lido pelo rastreador que ainda não está cadastrado em nenhum motorista. */
  motoristaId!: string | null;
  /** `rastreador` (cartão), `app` ou `escala`. */
  origem!: 'rastreador' | 'app' | 'escala';
  /** ISO 8601 (UTC). */
  inicio!: string;
  /** ISO 8601 (UTC); `null` enquanto o motorista continua no veículo. */
  fim!: string | null;
}

export class PaginaMotoristas {
  dados!: MotoristaDto[];
  proximoCursor!: string | null;
}
export class PaginaVencimentos {
  dados!: VencimentoDto[];
  proximoCursor!: string | null;
}
export class PaginaVinculos {
  dados!: VinculoDto[];
  /** Passe em `cursor` para a próxima página; `null` na última. */
  proximoCursor!: string | null;
}

export const paraMotoristaDto = (m: MotoristaRow): MotoristaDto => ({
  id: m.id,
  nome: m.nome,
  cnh: m.cnh,
  cnhCategoria: m.cnh_categoria,
  cnhValidade: m.cnh_validade,
  toxicologicoValidade: m.toxicologico_validade,
  telefone: m.telefone,
  temCartao: !!m.codigo_identificacao,
  regime: m.regime,
  ear: m.ear,
  ativo: m.desativado_em === null,
  criadoEm: iso(m.created_at)!,
  atualizadoEm: iso(m.updated_at)!,
});

export const paraVinculoDto = (v: MotoristaVinculoRow): VinculoDto => ({
  id: v.id,
  veiculoId: v.asset_id,
  motoristaId: v.motorista_id,
  origem: v.origem,
  inicio: iso(v.inicio)!,
  fim: iso(v.fim),
});
