import type { ModeloRow, RespostaRow } from '../../../checklist/checklist.repository';
import type { AbastecimentoRow } from '../../../combustivel/abastecimentos.repository';
import type { Divergencia } from '../../../combustivel/combustivel.service';
import type { OsRow, PlanoRow } from '../../../manutencao/manutencao.repository';
import type { StatusPlanoAtivo } from '../../../manutencao/manutencao.service';
import type { MultaRow } from '../../../multas/multas.repository';
import type { IndicacaoPendente, RiscoCnh } from '../../../multas/multas.service';
import type { MovimentoRow, PneuRow } from '../../../pneus/pneus.repository';
import type { NivelSulco } from '../../../pneus/pneus.service';
import { iso } from '../../comum/periodo';

const num = (v: string | number | null | undefined): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

// ---------- combustível

export class DivergenciaDto {
  /** `litros`, `valor`, `data` ou `posto` (contra a nota fiscal), `km` (contra o rastreador) ou `salto_km` (contra o anterior). */
  tipo!: string;
  detalhe!: string;
}

export class AbastecimentoDto {
  id!: string;
  veiculoId!: string;
  motoristaId!: string | null;
  /** ISO 8601 (UTC). */
  dataHora!: string;
  odometroKm!: number;
  litros!: number;
  valorTotal!: number;
  precoLitro!: number | null;
  combustivel!: string;
  posto!: string | null;
  postoCnpj!: string | null;
  /** Odômetro do rastreador no momento, quando havia. */
  odometroRastreadorKm!: number | null;
  /** Chave da nota fiscal, quando lançada. */
  chaveNotaFiscal!: string | null;
  /** Diferenças entre o lançamento, a nota, o rastreador e o abastecimento anterior, pelas tolerâncias do Setup. */
  divergencias!: DivergenciaDto[];
}

export const paraAbastecimentoDto = (a: AbastecimentoRow & { divergencias: Divergencia[] }): AbastecimentoDto => ({
  id: a.id,
  veiculoId: a.asset_id,
  motoristaId: a.motorista_id,
  dataHora: a.ts.toISOString(),
  odometroKm: Number(a.odometro),
  litros: Number(a.litros),
  valorTotal: Number(a.total),
  precoLitro: num(a.preco_litro),
  combustivel: a.combustivel,
  posto: a.posto,
  postoCnpj: a.posto_cnpj,
  odometroRastreadorKm: num(a.km_rastreador),
  chaveNotaFiscal: a.nf?.chave ?? null,
  divergencias: a.divergencias,
});

// ---------- multas

export class MultaDto {
  id!: string;
  /** Número do auto de infração. */
  auto!: string;
  orgao!: string;
  veiculoId!: string;
  motoristaId!: string | null;
  /** Data e hora da infração, ISO 8601 (UTC). */
  dataHora!: string;
  local!: string;
  /** Código da infração (CTB). */
  codigo!: string;
  descricao!: string;
  gravidade!: string;
  pontos!: number;
  valor!: number;
  /** `YYYY-MM-DD`. */
  notificadoEm!: string | null;
  /** `YYYY-MM-DD`. */
  vencimento!: string;
  situacao!: string;
  /** ISO 8601 (UTC); `null` se o condutor ainda não foi indicado. */
  indicadoEm!: string | null;
}

export class IndicacaoDto {
  multaId!: string;
  auto!: string;
  veiculoId!: string;
  /** ISO 8601 (UTC). */
  dataHoraInfracao!: string;
  /** `YYYY-MM-DD`. */
  notificadoEm!: string | null;
  /** A notificação não foi lançada: o prazo é estimado (infração + 15 dias). */
  notificacaoEstimada!: boolean;
  /** Fim do prazo para indicar o condutor, ISO 8601 (UTC). */
  prazoEm!: string;
  /** `no_prazo`, `aviso`, `critica` ou `vencida`. */
  estado!: string;
}

export class PontuacaoCnhDto {
  motoristaId!: string;
  nome!: string;
  /** Exerce atividade remunerada (limite próprio). */
  ear!: boolean;
  /** Pontos nos últimos 12 meses. */
  pontos!: number;
  gravissimas!: number;
  /** Limite de pontos aplicável ao motorista. */
  limite!: number;
  usoPct!: number;
  /** Passou do percentual de risco configurado. */
  risco!: boolean;
}

export const paraMultaDto = (m: MultaRow): MultaDto => ({
  id: m.id,
  auto: m.auto,
  orgao: m.orgao,
  veiculoId: m.asset_id,
  motoristaId: m.motorista_id,
  dataHora: m.ts.toISOString(),
  local: m.local,
  codigo: m.codigo,
  descricao: m.descricao,
  gravidade: m.gravidade,
  pontos: m.pontos,
  valor: Number(m.valor),
  notificadoEm: m.notificado_em,
  vencimento: m.vencimento,
  situacao: m.status,
  indicadoEm: iso(m.indicado_em),
});

export const paraIndicacaoDto = (i: IndicacaoPendente): IndicacaoDto => ({
  multaId: i.id,
  auto: i.auto,
  veiculoId: i.assetId,
  dataHoraInfracao: i.ts,
  notificadoEm: i.notificadoEm,
  notificacaoEstimada: i.notificacaoEstimada,
  prazoEm: i.prazoEm,
  estado: i.estado,
});

export const paraPontuacaoCnhDto = (r: RiscoCnh): PontuacaoCnhDto => ({ ...r });

// ---------- manutenção

/** Plano de manutenção preventiva. */
export class PlanoDto {
  id!: string;
  nome!: string;
  servico!: string;
  itens!: string;
  /** O que dispara: km, dias ou o que vier primeiro. */
  gatilho!: string;
  intervaloKm!: number;
  intervaloDias!: number;
  antecedenciaKm!: number;
  antecedenciaDias!: number;
  ativo!: boolean;
  veiculoIds!: string[];
}

/** Situação de um plano num veículo. */
export class SituacaoManutencaoDto {
  planoId!: string;
  veiculoId!: string;
  kmAtual!: number;
  ultimaKm!: number;
  /** `YYYY-MM-DD` ou ISO 8601. */
  ultimaEm!: string | null;
  proximaKm!: number | null;
  proximaEm!: string | null;
  restamKm!: number | null;
  restamDias!: number | null;
  /** `sem_historico`, `os_aberta`, `em_dia`, `proxima` ou `vencida`. */
  situacao!: string;
  /** `crit`, `alerta` ou `null`. */
  nivel!: string | null;
  ordemAbertaId!: string | null;
}

export class OrdemServicoDto {
  id!: string;
  numero!: string;
  veiculoId!: string;
  planoId!: string | null;
  /** Preventiva, corretiva… */
  tipo!: string;
  titulo!: string;
  descricao!: string | null;
  servicos!: string[];
  situacao!: string;
  naoPlanejada!: boolean;
  /** ISO 8601 (UTC). */
  abertaEm!: string;
  entradaOficinaEm!: string | null;
  liberadaEm!: string | null;
  odometroKm!: number | null;
  custo!: number;
  fornecedor!: string | null;
}

export const paraPlanoDto = (p: PlanoRow): PlanoDto => ({
  id: p.id,
  nome: p.nome,
  servico: p.servico,
  itens: p.itens,
  gatilho: p.gatilho,
  intervaloKm: p.km_intervalo,
  intervaloDias: p.dias_intervalo,
  antecedenciaKm: p.antecedencia_km,
  antecedenciaDias: p.antecedencia_dias,
  ativo: p.ativo,
  veiculoIds: p.asset_ids ?? [],
});

export const paraSituacaoDto = (s: StatusPlanoAtivo): SituacaoManutencaoDto => ({
  planoId: s.planoId,
  veiculoId: s.assetId,
  kmAtual: s.kmAtual,
  ultimaKm: s.ultimaKm,
  ultimaEm: s.ultimaEm,
  proximaKm: s.proximoKm,
  proximaEm: s.proximoEm,
  restamKm: s.restaKm,
  restamDias: s.restaDias,
  situacao: s.status,
  nivel: s.nivel,
  ordemAbertaId: s.osAbertaId,
});

export const paraOsDto = (o: OsRow): OrdemServicoDto => ({
  id: o.id,
  numero: o.numero,
  veiculoId: o.asset_id,
  planoId: o.plano_id,
  tipo: o.tipo,
  titulo: o.titulo,
  descricao: o.descricao,
  servicos: o.servicos ?? [],
  situacao: o.status,
  naoPlanejada: o.nao_planejada,
  abertaEm: o.aberta_em.toISOString(),
  entradaOficinaEm: iso(o.entrada_oficina_em),
  liberadaEm: iso(o.liberada_em),
  odometroKm: num(o.odometro),
  custo: Number(o.custo),
  fornecedor: o.fornecedor,
});

// ---------- checklist

export class PerguntaDto {
  id!: string;
  texto!: string;
  /** Tipo de resposta (sim/não, opções, escala, texto…). */
  tipo!: string;
  obrigatoria!: boolean;
  exigeFoto!: boolean;
  opcoes!: string[];
}

export class ModeloChecklistDto {
  id!: string;
  nome!: string;
  ativo!: boolean;
  perguntas!: PerguntaDto[];
}

export class RespostaPerguntaDto {
  perguntaId!: string;
  valor!: unknown;
  /** Uma foto foi anexada (o arquivo não sai pela API). */
  temFoto!: boolean;
}

export class ChecklistDto {
  id!: string;
  modeloId!: string;
  veiculoId!: string | null;
  motoristaId!: string | null;
  respondente!: string | null;
  /** ISO 8601 (UTC). */
  iniciadoEm!: string;
  /** ISO 8601 (UTC). */
  finalizadoEm!: string;
  naoConformidades!: number;
  respostas!: RespostaPerguntaDto[];
}

export const paraModeloChecklistDto = (m: ModeloRow): ModeloChecklistDto => ({
  id: m.id,
  nome: m.nome,
  ativo: m.ativo,
  perguntas: (m.perguntas ?? []).map((p) => ({ id: p.id, texto: p.label, tipo: p.type, obrigatoria: !!p.required, exigeFoto: !!p.requirePhoto, opcoes: p.options ?? [] })),
});

export const paraChecklistDto = (r: RespostaRow): ChecklistDto => ({
  id: r.id,
  modeloId: r.modelo_id,
  veiculoId: r.asset_id,
  motoristaId: r.motorista_id,
  respondente: r.respondente,
  iniciadoEm: r.iniciado_em.toISOString(),
  finalizadoEm: r.finalizado_em.toISOString(),
  naoConformidades: r.nao_conformidades,
  respostas: Object.entries(r.respostas ?? {}).map(([perguntaId, v]) => ({ perguntaId, valor: v?.value ?? null, temFoto: !!v?.photo })),
});

// ---------- pneus

export class PneuDto {
  id!: string;
  numeroFogo!: string;
  marca!: string | null;
  modelo!: string | null;
  medida!: string | null;
  vidaAtual!: number;
  vidasMax!: number;
  sulcoInicialMm!: number;
  sulcoAtualMm!: number;
  /** `ok`, `atencao`, `retirar` ou `ilegal`, pelos limites do Setup; `null` em descartado. */
  nivelSulco!: NivelSulco | null;
  situacao!: string;
  /** Veículo em que está montado; `null` em estoque. */
  veiculoId!: string | null;
  posicao!: string | null;
  kmAcumulado!: number;
  custoTotal!: number;
}

export class MovimentoPneuDto {
  id!: string;
  pneuId!: string;
  /** Montagem, desmontagem, rodízio, medição, recapagem, descarte… */
  tipo!: string;
  /** ISO 8601 (UTC). */
  dataHora!: string;
  veiculoId!: string | null;
  posicao!: string | null;
  kmVeiculo!: number | null;
  sulcoMm!: number | null;
  custo!: number | null;
  observacao!: string | null;
}

export const paraPneuDto = (p: PneuRow & { nivel: NivelSulco | null }): PneuDto => ({
  id: p.id,
  numeroFogo: p.numero_fogo,
  marca: p.marca,
  modelo: p.modelo,
  medida: p.medida,
  vidaAtual: p.vida_atual,
  vidasMax: p.vidas_max,
  sulcoInicialMm: Number(p.sulco_inicial_mm),
  sulcoAtualMm: Number(p.sulco_atual_mm),
  nivelSulco: p.nivel,
  situacao: p.status,
  veiculoId: p.asset_id,
  posicao: p.posicao,
  kmAcumulado: Number(p.km_acumulado),
  custoTotal: Number(p.custo_total),
});

export const paraMovimentoPneuDto = (m: MovimentoRow): MovimentoPneuDto => ({
  id: m.id,
  pneuId: m.pneu_id,
  tipo: m.tipo,
  dataHora: m.ts.toISOString(),
  veiculoId: m.asset_id,
  posicao: m.posicao,
  kmVeiculo: num(m.km_veiculo),
  sulcoMm: num(m.sulco_mm),
  custo: num(m.custo),
  observacao: m.obs,
});

// ---------- páginas

export class PaginaAbastecimentos { dados!: AbastecimentoDto[]; /** Passe em `cursor` para a próxima página; `null` na última. */ proximoCursor!: string | null }
export class PaginaMultas { dados!: MultaDto[]; /** Passe em `cursor` para a próxima página; `null` na última. */ proximoCursor!: string | null }
export class PaginaIndicacoes { dados!: IndicacaoDto[]; proximoCursor!: string | null }
export class PaginaPontuacaoCnh { dados!: PontuacaoCnhDto[]; proximoCursor!: string | null }
export class PaginaPlanos { dados!: PlanoDto[]; proximoCursor!: string | null }
export class PaginaSituacaoManutencao { dados!: SituacaoManutencaoDto[]; proximoCursor!: string | null }
export class PaginaOrdens { dados!: OrdemServicoDto[]; /** Passe em `cursor` para a próxima página; `null` na última. */ proximoCursor!: string | null }
export class PaginaModelosChecklist { dados!: ModeloChecklistDto[]; proximoCursor!: string | null }
export class PaginaChecklists { dados!: ChecklistDto[]; /** Passe em `cursor` para a próxima página; `null` na última. */ proximoCursor!: string | null }
export class PaginaPneus { dados!: PneuDto[]; proximoCursor!: string | null }
export class PaginaMovimentosPneu { dados!: MovimentoPneuDto[]; /** Passe em `cursor` para a próxima página; `null` na última. */ proximoCursor!: string | null }
