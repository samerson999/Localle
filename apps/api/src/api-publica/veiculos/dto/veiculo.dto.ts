import type { AssetParaApi } from '../../../assets/assets.repository';

/** Veículo (ou equipamento) na API pública. Contrato estável — mudança incompatível vira `/v2`. */
export class VeiculoDto {
  id!: string;
  /** Placa sem formatação; `null` em equipamento sem placa. */
  placa!: string | null;
  /** Código interno ou número de série. */
  identificador!: string | null;
  /** Nome de exibição: a placa, ou o identificador quando não há placa. */
  nome!: string;
  /** Apelido digitado no cadastro. */
  apelido!: string | null;
  categoria!: string | null;
  tipo!: string | null;
  marca!: string | null;
  modelo!: string | null;
  ano!: number | null;
  chassi!: string | null;
  renavam!: string | null;
  uf!: string | null;
  /** `ativo`, `vendido` ou `baixado`. */
  situacao!: 'ativo' | 'vendido' | 'baixado';
  /** ISO 8601 (UTC). */
  situacaoDesde!: string;
  motoristaId!: string | null;
  operacaoId!: string | null;
  grupoIds!: string[];
  /** ISO 8601 (UTC). */
  criadoEm!: string;
  /** ISO 8601 (UTC). */
  atualizadoEm!: string;
}

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isInteger(n) ? n : null;
};

export function paraVeiculoDto(a: AssetParaApi): VeiculoDto {
  const d = a.dados ?? {};
  return {
    id: a.id,
    placa: a.plate,
    identificador: a.identificador,
    nome: a.rotulo,
    apelido: txt(d.name),
    categoria: txt(d.category),
    tipo: txt(d.tipo),
    marca: a.marca_nome ?? txt(d.brand),
    modelo: a.modelo_nome ?? txt(d.model),
    ano: int(d.year),
    chassi: txt(d.chassi),
    renavam: txt(d.renavam),
    uf: txt(d.uf),
    situacao: a.status,
    situacaoDesde: new Date(a.status_desde).toISOString(),
    motoristaId: a.motorista_id,
    operacaoId: a.operacao_id,
    grupoIds: a.grupo_ids ?? [],
    criadoEm: new Date(a.created_at).toISOString(),
    atualizadoEm: new Date(a.updated_at).toISOString(),
  };
}

export class PaginaVeiculos {
  dados!: VeiculoDto[];
  /** Passe em `cursor` para a próxima página; `null` na última. */
  proximoCursor!: string | null;
}
