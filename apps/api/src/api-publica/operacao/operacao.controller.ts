import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { JornadaRepository } from '../../jornada/jornada.repository';
import { JornadaService } from '../../jornada/jornada.service';
import { RankingRepository } from '../../ranking/ranking.repository';
import { RankingService } from '../../ranking/ranking.service';
import { ViagensRepository } from '../../viagens/viagens.repository';
import { ApiPublica, ClienteDaChave } from '../auth/api-publica.decorator';
import { aposInstante, lerCursor, lerLimite, montarPagina } from '../comum/paginacao';
import { JANELA, lerPeriodo, paginaUnica, uuidOpcional } from '../comum/periodo';
import { PERIODO, PAGINA, Parametros } from '../comum/parametros';
import {
  EspelhoDto,
  PaginaEventosRanking,
  PaginaMarcacoes,
  PaginaRotas,
  PaginaViagens,
  paraDiaJornadaDto,
  paraEventoRankingDto,
  paraLimitesDto,
  paraMarcacaoDto,
  paraRankingDto,
  paraRotaDto,
  paraViagemDto,
  RankingDto,
  ViagemDto,
} from './dto/operacao.dto';

/** Viagens (escopo `viagens`), jornada (escopo `jornada`) e ranking de motoristas (escopo `ranking`). */
@Controller('v1')
export class OperacaoController {
  constructor(
    private readonly viagens: ViagensRepository,
    private readonly jornada: JornadaRepository,
    private readonly jornadaService: JornadaService,
    private readonly ranking: RankingRepository,
    private readonly rankingService: RankingService,
  ) {}

  /**
   * Viagens iniciadas (ou criadas, se ainda aguardando) no período `de`–`ate` (máximo 31 dias), mais recentes primeiro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   * @param abertas `true`: só as aguardando ou em andamento
   */
  @Get(['viagens', 'clientes/:clientId/viagens'])
  @ApiPublica('viagens')
  @Parametros(PERIODO, ['veiculoId', 'abertas', ...PAGINA])
  async listarViagens(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoId') veiculoId?: string,
    @Query('abertas') abertas?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaViagens> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.viagens.paginaParaApi(clientId, {
      ...p,
      assetId: uuidOpcional(veiculoId, 'veiculoId'),
      abertas: abertas === 'true',
      apos: aposInstante(lerCursor(cursor)),
      limite: lim,
    });
    return montarPagina(linhas, lim, (v) => ({ k: v.referencia.toISOString(), id: v.id }), paraViagemDto);
  }

  /** Rotas-padrão de viagem. */
  @Get(['viagens/rotas', 'clientes/:clientId/viagens/rotas'])
  @ApiPublica('viagens')
  async listarRotas(@ClienteDaChave() clientId: string): Promise<PaginaRotas> {
    return paginaUnica((await this.viagens.listarMatrizes(clientId)).map(paraRotaDto));
  }

  @Get(['viagens/:id', 'clientes/:clientId/viagens/:id'])
  @ApiPublica('viagens')
  async buscarViagem(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<ViagemDto> {
    const v = await this.viagens.buscarViagem(clientId, id);
    if (!v) throw new NotFoundException({ statusCode: 404, codigo: 'viagem_nao_encontrada', message: 'Viagem não encontrada' });
    return paraViagemDto(v);
  }

  /**
   * Marcações de jornada no período `de`–`ate` (máximo 31 dias), em ordem de tempo.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['jornada/marcacoes', 'clientes/:clientId/jornada/marcacoes'])
  @ApiPublica('jornada')
  @Parametros(PERIODO, ['motoristaId', ...PAGINA])
  async marcacoes(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('motoristaId') motoristaId?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaMarcacoes> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.jornada.paginaParaApi(clientId, { ...p, motoristaId: uuidOpcional(motoristaId, 'motoristaId'), apos: aposInstante(lerCursor(cursor)), limite: lim });
    return montarPagina(linhas, lim, (m) => ({ k: m.ts.toISOString(), id: m.id }), paraMarcacaoDto);
  }

  /**
   * Espelho de ponto de um motorista no período (máximo 31 dias): tempos por dia e infrações, com os limites do Setup.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['jornada/espelho', 'clientes/:clientId/jornada/espelho'])
  @ApiPublica('jornada')
  @Parametros(['motoristaId', ...PERIODO])
  async espelho(@ClienteDaChave() clientId: string, @Query('motoristaId') motoristaId?: string, @Query('de') de?: string, @Query('ate') ate?: string): Promise<EspelhoDto> {
    const id = uuidOpcional(motoristaId, 'motoristaId');
    if (!id) throw new BadRequestException({ statusCode: 400, codigo: 'parametro_invalido', message: '"motoristaId" é obrigatório' });
    const p = lerPeriodo(de, ate, JANELA.padrao);
    let e;
    try {
      e = await this.jornadaService.espelho(clientId, id, p.de, p.ate);
    } catch (err) {
      if (err instanceof NotFoundException) throw new NotFoundException({ statusCode: 404, codigo: 'motorista_nao_encontrado', message: 'Motorista não encontrado' });
      throw err;
    }
    return { motoristaId: e.motoristaId, regime: e.regime, limites: paraLimitesDto(e.limites, e.regime), dias: e.dias.map(paraDiaJornadaDto) };
  }

  /**
   * Ranking dos motoristas no período (máximo 31 dias): pontos por tipo de evento, pela matriz do cliente.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['ranking', 'clientes/:clientId/ranking'])
  @ApiPublica('ranking')
  @Parametros(PERIODO)
  async calcularRanking(@ClienteDaChave() clientId: string, @Query('de') de?: string, @Query('ate') ate?: string): Promise<RankingDto> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    return paraRankingDto(await this.rankingService.calcular(clientId, p.de, p.ate));
  }

  /**
   * Eventos que compõem a pontuação do ranking no período (máximo 31 dias), em ordem de tempo.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['ranking/eventos', 'clientes/:clientId/ranking/eventos'])
  @ApiPublica('ranking')
  @Parametros(PERIODO, ['motoristaId', ...PAGINA])
  async eventosRanking(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('motoristaId') motoristaId?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaEventosRanking> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.ranking.eventosParaApi(clientId, { ...p, motoristaId: uuidOpcional(motoristaId, 'motoristaId'), apos: aposInstante(lerCursor(cursor)), limite: lim });
    return montarPagina(linhas, lim, (e) => ({ k: e.ts.toISOString(), id: e.id }), paraEventoRankingDto);
  }
}
