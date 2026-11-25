import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ChecklistRepository } from '../../checklist/checklist.repository';
import { AbastecimentosRepository } from '../../combustivel/abastecimentos.repository';
import { CombustivelService } from '../../combustivel/combustivel.service';
import { ManutencaoRepository } from '../../manutencao/manutencao.repository';
import { ManutencaoService } from '../../manutencao/manutencao.service';
import { MultasRepository } from '../../multas/multas.repository';
import { MultasService } from '../../multas/multas.service';
import { PneusRepository } from '../../pneus/pneus.repository';
import { PneusService } from '../../pneus/pneus.service';
import { ApiPublica, ClienteDaChave } from '../auth/api-publica.decorator';
import { aposInstante, lerCursor, lerLimite, montarPagina } from '../comum/paginacao';
import { JANELA, lerPeriodo, paginaUnica, uuidOpcional } from '../comum/periodo';
import { PERIODO, PAGINA, Parametros } from '../comum/parametros';
import {
  ChecklistDto,
  MultaDto,
  OrdemServicoDto,
  PaginaAbastecimentos,
  PaginaChecklists,
  PaginaIndicacoes,
  PaginaModelosChecklist,
  PaginaMovimentosPneu,
  PaginaMultas,
  PaginaOrdens,
  PaginaPlanos,
  PaginaPneus,
  PaginaPontuacaoCnh,
  PaginaSituacaoManutencao,
  paraAbastecimentoDto,
  paraChecklistDto,
  paraIndicacaoDto,
  paraModeloChecklistDto,
  paraMovimentoPneuDto,
  paraMultaDto,
  paraOsDto,
  paraPlanoDto,
  paraPneuDto,
  paraPontuacaoCnhDto,
  paraSituacaoDto,
  PneuDto,
} from './dto/custos.dto';

const naoEncontrado = (codigo: string, message: string) => new NotFoundException({ statusCode: 404, codigo, message });

/** Combustível, multas, manutenção, checklist e pneus — cada grupo com o próprio escopo. */
@Controller('v1')
export class CustosController {
  constructor(
    private readonly abastecimentos: AbastecimentosRepository,
    private readonly combustivel: CombustivelService,
    private readonly multas: MultasRepository,
    private readonly multasService: MultasService,
    private readonly manutencao: ManutencaoRepository,
    private readonly manutencaoService: ManutencaoService,
    private readonly checklist: ChecklistRepository,
    private readonly pneus: PneusRepository,
    private readonly pneusService: PneusService,
  ) {}

  // ---------- combustível

  /**
   * Abastecimentos no período `de`–`ate` (máximo 31 dias), mais recentes primeiro, com as divergências apontadas.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['abastecimentos', 'clientes/:clientId/abastecimentos'])
  @ApiPublica('combustivel')
  @Parametros(PERIODO, ['veiculoId', ...PAGINA])
  async listarAbastecimentos(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoId') veiculoId?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaAbastecimentos> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.abastecimentos.paginaParaApi(clientId, { ...p, assetId: uuidOpcional(veiculoId, 'veiculoId'), apos: aposInstante(lerCursor(cursor)), limite: lim });
    const pagina = montarPagina(linhas, lim, (a) => ({ k: a.ts.toISOString(), id: a.id }), (a) => a);
    return { dados: (await this.combustivel.comDivergencias(clientId, pagina.dados)).map(paraAbastecimentoDto), proximoCursor: pagina.proximoCursor };
  }

  // ---------- multas

  /**
   * Multas pela data da infração, no período `de`–`ate` (máximo 31 dias), mais recentes primeiro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['multas', 'clientes/:clientId/multas'])
  @ApiPublica('multas')
  @Parametros(PERIODO, ['veiculoId', 'motoristaId', ...PAGINA])
  async listarMultas(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoId') veiculoId?: string,
    @Query('motoristaId') motoristaId?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaMultas> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.multas.paginaParaApi(clientId, {
      ...p,
      assetId: uuidOpcional(veiculoId, 'veiculoId'),
      motoristaId: uuidOpcional(motoristaId, 'motoristaId'),
      apos: aposInstante(lerCursor(cursor)),
      limite: lim,
    });
    return montarPagina(linhas, lim, (m) => ({ k: m.ts.toISOString(), id: m.id }), paraMultaDto);
  }

  /** Multas abertas sem condutor indicado, com o prazo de indicação. */
  @Get(['multas/indicacoes', 'clientes/:clientId/multas/indicacoes'])
  @ApiPublica('multas')
  async indicacoes(@ClienteDaChave() clientId: string): Promise<PaginaIndicacoes> {
    return paginaUnica((await this.multasService.indicacoesPendentes(clientId)).map(paraIndicacaoDto));
  }

  /** Pontos de CNH de cada motorista nos últimos 12 meses, contra o limite aplicável. */
  @Get(['multas/pontuacao-cnh', 'clientes/:clientId/multas/pontuacao-cnh'])
  @ApiPublica('multas')
  async pontuacaoCnh(@ClienteDaChave() clientId: string): Promise<PaginaPontuacaoCnh> {
    return paginaUnica((await this.multasService.riscoCnh(clientId)).map(paraPontuacaoCnhDto));
  }

  @Get(['multas/:id', 'clientes/:clientId/multas/:id'])
  @ApiPublica('multas')
  async buscarMulta(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<MultaDto> {
    const m = await this.multas.buscar(clientId, id);
    if (!m) throw naoEncontrado('multa_nao_encontrada', 'Multa não encontrada');
    return paraMultaDto(m);
  }

  // ---------- manutenção

  /** Planos de manutenção preventiva e os veículos de cada um. */
  @Get(['manutencao/planos', 'clientes/:clientId/manutencao/planos'])
  @ApiPublica('manutencao')
  async planos(@ClienteDaChave() clientId: string): Promise<PaginaPlanos> {
    return paginaUnica((await this.manutencao.listarPlanos(clientId)).map(paraPlanoDto));
  }

  /** Situação de cada plano ativo em cada veículo: em dia, próxima, vencida, OS aberta. */
  @Get(['manutencao/situacao', 'clientes/:clientId/manutencao/situacao'])
  @ApiPublica('manutencao')
  async situacao(@ClienteDaChave() clientId: string): Promise<PaginaSituacaoManutencao> {
    return paginaUnica((await this.manutencaoService.statusGeral(clientId)).map(paraSituacaoDto));
  }

  /**
   * Ordens de serviço abertas no período `de`–`ate` (máximo 31 dias), mais recentes primeiro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   * @param abertas `true`: só as não concluídas nem canceladas
   */
  @Get(['manutencao/ordens', 'clientes/:clientId/manutencao/ordens'])
  @ApiPublica('manutencao')
  @Parametros(PERIODO, ['veiculoId', 'abertas', ...PAGINA])
  async ordens(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoId') veiculoId?: string,
    @Query('abertas') abertas?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaOrdens> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.manutencao.osParaApi(clientId, {
      ...p,
      assetId: uuidOpcional(veiculoId, 'veiculoId'),
      abertas: abertas === 'true',
      apos: aposInstante(lerCursor(cursor)),
      limite: lim,
    });
    return montarPagina(linhas, lim, (o) => ({ k: o.aberta_em.toISOString(), id: o.id }), paraOsDto);
  }

  @Get(['manutencao/ordens/:id', 'clientes/:clientId/manutencao/ordens/:id'])
  @ApiPublica('manutencao')
  async buscarOrdem(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<OrdemServicoDto> {
    const o = await this.manutencao.buscarOs(clientId, id);
    if (!o) throw naoEncontrado('ordem_nao_encontrada', 'Ordem de serviço não encontrada');
    return paraOsDto(o);
  }

  // ---------- checklist

  /** Modelos de checklist e suas perguntas. */
  @Get(['checklists/modelos', 'clientes/:clientId/checklists/modelos'])
  @ApiPublica('checklist')
  async modelos(@ClienteDaChave() clientId: string): Promise<PaginaModelosChecklist> {
    return paginaUnica((await this.checklist.listarModelos(clientId)).map(paraModeloChecklistDto));
  }

  /**
   * Checklists finalizados no período `de`–`ate` (máximo 31 dias), mais recentes primeiro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['checklists', 'clientes/:clientId/checklists'])
  @ApiPublica('checklist')
  @Parametros(PERIODO, ['modeloId', 'veiculoId', ...PAGINA])
  async listarChecklists(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('modeloId') modeloId?: string,
    @Query('veiculoId') veiculoId?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaChecklists> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.checklist.respostasParaApi(clientId, {
      ...p,
      modeloId: uuidOpcional(modeloId, 'modeloId'),
      assetId: uuidOpcional(veiculoId, 'veiculoId'),
      apos: aposInstante(lerCursor(cursor)),
      limite: lim,
    });
    return montarPagina(linhas, lim, (r) => ({ k: r.finalizado_em.toISOString(), id: r.id }), paraChecklistDto);
  }

  @Get(['checklists/:id', 'clientes/:clientId/checklists/:id'])
  @ApiPublica('checklist')
  async buscarChecklist(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<ChecklistDto> {
    const r = await this.checklist.buscarResposta(clientId, id);
    if (!r) throw naoEncontrado('checklist_nao_encontrado', 'Checklist não encontrado');
    return paraChecklistDto(r);
  }

  // ---------- pneus

  /** Pneus do cliente, com o nível do sulco pelos limites do Setup. */
  @Get(['pneus', 'clientes/:clientId/pneus'])
  @ApiPublica('pneus')
  @Parametros([], ['veiculoId'])
  async listarPneus(@ClienteDaChave() clientId: string, @Query('veiculoId') veiculoId?: string): Promise<PaginaPneus> {
    return paginaUnica((await this.pneusService.listarComNivel(clientId, null, uuidOpcional(veiculoId, 'veiculoId'))).map(paraPneuDto));
  }

  /**
   * Montagens, rodízios, medições e recapagens no período `de`–`ate` (máximo 31 dias), mais recentes primeiro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['pneus/movimentos', 'clientes/:clientId/pneus/movimentos'])
  @ApiPublica('pneus')
  @Parametros(PERIODO, ['veiculoId', ...PAGINA])
  async movimentos(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoId') veiculoId?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaMovimentosPneu> {
    return this.paginaMovimentos(clientId, null, de, ate, veiculoId, limite, cursor);
  }

  @Get(['pneus/:id', 'clientes/:clientId/pneus/:id'])
  @ApiPublica('pneus')
  async buscarPneu(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<PneuDto> {
    if (!(await this.pneus.buscar(clientId, id))) throw naoEncontrado('pneu_nao_encontrado', 'Pneu não encontrado');
    const p = (await this.pneusService.listarComNivel(clientId, null, null)).find((x) => x.id === id);
    if (!p) throw naoEncontrado('pneu_nao_encontrado', 'Pneu não encontrado');
    return paraPneuDto(p);
  }

  /**
   * Movimentos de um pneu no período `de`–`ate` (máximo 31 dias), mais recentes primeiro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['pneus/:id/movimentos', 'clientes/:clientId/pneus/:id/movimentos'])
  @ApiPublica('pneus')
  @Parametros(PERIODO, PAGINA)
  async movimentosDoPneu(
    @ClienteDaChave() clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaMovimentosPneu> {
    if (!(await this.pneus.buscar(clientId, id))) throw naoEncontrado('pneu_nao_encontrado', 'Pneu não encontrado');
    return this.paginaMovimentos(clientId, id, de, ate, undefined, limite, cursor);
  }

  private async paginaMovimentos(clientId: string, pneuId: string | null, de?: string, ate?: string, veiculoId?: string, limite?: string, cursor?: string) {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.pneus.movimentosParaApi(clientId, { ...p, pneuId, assetId: uuidOpcional(veiculoId, 'veiculoId'), apos: aposInstante(lerCursor(cursor)), limite: lim });
    return montarPagina(linhas, lim, (m) => ({ k: m.ts.toISOString(), id: m.id }), paraMovimentoPneuDto);
  }
}
