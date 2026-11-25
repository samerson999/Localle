import type { Grupo } from '../../../grupos/grupos.repository';
import type { Operacao } from '../../../operacoes/operacoes.repository';
import type { RastreadorDoCliente } from '../../../rastreadores/rastreador-vinculo.entity';
import { iso } from '../../comum/periodo';

/** Dados cadastrais do cliente dono da chave. */
export class EmpresaDto {
  razaoSocial!: string | null;
  cnpj!: string | null;
  endereco!: string | null;
}

export class GrupoDto {
  id!: string;
  nome!: string;
  /** Veículos do grupo. Um veículo pode estar em vários grupos. */
  veiculoIds!: string[];
}

/** Operação (centro de custo) a que os veículos pertencem. */
export class OperacaoDto {
  id!: string;
  nome!: string;
  /** Meta de consumo da operação, em km/l. */
  metaKml!: number | null;
}

/** Rastreador ou tag do cliente e a instalação vigente, quando instalado. */
export class RastreadorDto {
  id!: string;
  /** Identificador que o aparelho envia (IMEI ou equivalente). */
  imei!: string;
  modelo!: string | null;
  /** `rastreador` ou `tag`. */
  tipo!: 'rastreador' | 'tag';
  /** Veículo em que está instalado agora; `null` em estoque. */
  veiculoId!: string | null;
  /** `principal`, `backup` ou `can`; `null` em estoque. */
  papel!: 'principal' | 'backup' | 'can' | null;
  /** ISO 8601 (UTC). */
  instaladoEm!: string | null;
  leitorDeCartao!: boolean;
  /** Último pacote recebido do aparelho, ISO 8601 (UTC). */
  ultimoPacoteEm!: string | null;
  /** Última posição válida desde a instalação vigente, ISO 8601 (UTC). */
  posicaoEm!: string | null;
  latitude!: number | null;
  longitude!: number | null;
}

export const paraGrupoDto = (g: Grupo): GrupoDto => ({ id: g.id, nome: g.name, veiculoIds: g.assetIds });
export const paraOperacaoDto = (o: Operacao): OperacaoDto => ({ id: o.id, nome: o.nome, metaKml: o.metaKml });

export const paraRastreadorDto = (r: RastreadorDoCliente): RastreadorDto => ({
  id: r.id,
  imei: r.imei,
  modelo: r.modelo,
  tipo: r.tipo_aparelho,
  veiculoId: r.asset_id,
  papel: r.papel,
  instaladoEm: iso(r.instalado_em),
  leitorDeCartao: r.leitor_motorista,
  ultimoPacoteEm: iso(r.ultimo_pacote_em),
  posicaoEm: iso(r.posicao_em),
  latitude: r.latitude,
  longitude: r.longitude,
});

/** Listas de cadastro vêm completas numa página (`proximoCursor` sempre `null`). */
export class PaginaGrupos {
  dados!: GrupoDto[];
  proximoCursor!: string | null;
}
export class PaginaOperacoes {
  dados!: OperacaoDto[];
  proximoCursor!: string | null;
}
export class PaginaRastreadores {
  dados!: RastreadorDto[];
  proximoCursor!: string | null;
}
