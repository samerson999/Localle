import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AlertasRepository } from '../../alertas/alertas.repository';
import { ComandosRepository } from '../../comandos/comandos.repository';
import { ApiPublica, ClienteDaChave } from '../auth/api-publica.decorator';
import { aposInstante, lerCursor, lerLimite, montarPagina } from '../comum/paginacao';
import { JANELA, lerPeriodo, uuidOpcional } from '../comum/periodo';
import { PERIODO, PAGINA, Parametros } from '../comum/parametros';
import { AlertaDto, PaginaAlertas, PaginaComandos, paraAlertaDto, paraComandoDto } from './dto/ocorrencias.dto';

/** Alertas (escopo `alertas`) e comandos enviados aos rastreadores (escopo `comandos`). */
@Controller('v1')
export class OcorrenciasController {
  constructor(
    private readonly alertas: AlertasRepository,
    private readonly comandos: ComandosRepository,
  ) {}

  /**
   * Alertas no período `de`–`ate` (máximo 31 dias), mais recentes primeiro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   * @param abertos `true`: só ocorrências ainda sem tratamento
   */
  @Get(['alertas', 'clientes/:clientId/alertas'])
  @ApiPublica('alertas')
  @Parametros(PERIODO, ['veiculoId', 'abertos', ...PAGINA])
  async listar(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoId') veiculoId?: string,
    @Query('abertos') abertos?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaAlertas> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.alertas.paginaParaApi(clientId, {
      ...p,
      assetId: uuidOpcional(veiculoId, 'veiculoId'),
      abertos: abertos === 'true',
      apos: aposInstante(lerCursor(cursor)),
      limite: lim,
    });
    return montarPagina(linhas, lim, (a) => ({ k: a.ts, id: a.id }), paraAlertaDto);
  }

  @Get(['alertas/:id', 'clientes/:clientId/alertas/:id'])
  @ApiPublica('alertas')
  async buscar(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<AlertaDto> {
    const a = await this.alertas.buscar(clientId, id);
    if (!a) throw new NotFoundException({ statusCode: 404, codigo: 'alerta_nao_encontrado', message: 'Alerta não encontrado' });
    return paraAlertaDto(a);
  }

  /**
   * Comandos solicitados no período `de`–`ate` (máximo 31 dias), mais recentes primeiro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['comandos', 'clientes/:clientId/comandos'])
  @ApiPublica('comandos')
  @Parametros(PERIODO, ['veiculoId', ...PAGINA])
  async listarComandos(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoId') veiculoId?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaComandos> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.comandos.paginaParaApi(clientId, {
      ...p,
      assetId: uuidOpcional(veiculoId, 'veiculoId'),
      apos: aposInstante(lerCursor(cursor)),
      limite: lim,
    });
    return montarPagina(linhas, lim, (c) => ({ k: c.solicitadoEm, id: c.id }), paraComandoDto);
  }
}
