import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AssetsRepository } from '../../assets/assets.repository';
import { comunicacaoDaLinha } from '../../monitoring/comunicacao-status';
import { MonitoringRepository } from '../../monitoring/monitoring.repository';
import { SettingsService } from '../../settings/settings.service';
import { lerTelemetriaComIdade, mapeamentoDaLinha } from '../../telemetria/leitura';
import { ApiPublica, ClienteDaChave } from '../auth/api-publica.decorator';
import { aposInstante, lerCursor, lerLimite, montarPagina } from '../comum/paginacao';
import { JANELA, lerPeriodo, paginaUnica, uuidOpcional } from '../comum/periodo';
import { PERIODO, PAGINA, Parametros } from '../comum/parametros';
import { PaginaEventos, PaginaPosicoes, PaginaPosicoesAtuais, paraEventoDto, paraPosicaoAtualDto, paraPosicaoDto } from './dto/telemetria.dto';

/** Posições e eventos (escopos `posicoes` e `eventos`). */
@Controller('v1')
export class TelemetriaController {
  constructor(
    private readonly monitoring: MonitoringRepository,
    private readonly settings: SettingsService,
    private readonly assets: AssetsRepository,
  ) {}

  /** Última posição, ignição, comunicação e leituras de cada veículo ativo — a frota inteira numa página. */
  @Get(['posicoes/ultimas', 'clientes/:clientId/posicoes/ultimas'])
  @ApiPublica('posicoes')
  async ultimas(@ClienteDaChave() clientId: string): Promise<PaginaPosicoesAtuais> {
    const [linhas, semSinalH] = await Promise.all([
      this.monitoring.frotaAtual(clientId),
      this.settings.resolveMenorPorAtivo(clientId, 'monitoramento.sem_sinal_h'),
    ]);
    const agora = new Date();
    return paginaUnica(
      linhas.map((r) =>
        paraPosicaoAtualDto(r, comunicacaoDaLinha(r, semSinalH(r.asset_id), agora), lerTelemetriaComIdade(r.ultimos_atributos, r.atributos_vistos_em, mapeamentoDaLinha(r))),
      ),
    );
  }

  /**
   * Posições de um veículo em ordem de tempo, no período `de`–`ate` (máximo 7 dias). Até 1.000 por página.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['veiculos/:id/posicoes', 'clientes/:clientId/veiculos/:id/posicoes'])
  @ApiPublica('posicoes')
  @Parametros(PERIODO, PAGINA)
  async historico(
    @ClienteDaChave() clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaPosicoes> {
    const p = lerPeriodo(de, ate, JANELA.posicoesDeUmVeiculo);
    const lim = lerLimite(limite, 500, 1000);
    const c = aposInstante(lerCursor(cursor));
    if (!(await this.assets.findOne(clientId, { id }))) {
      throw new NotFoundException({ statusCode: 404, codigo: 'veiculo_nao_encontrado', message: 'Veículo não encontrado' });
    }
    const linhas = await this.monitoring.posicoesParaApi(clientId, id, p.de, p.ate, c?.ts ?? null, lim);
    return montarPagina(linhas, lim, (r) => ({ k: r.fix_time.toISOString(), id }), paraPosicaoDto);
  }

  /**
   * Eventos dos rastreadores no período `de`–`ate` (máximo 31 dias), mais recentes primeiro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   * @param tipo filtra pelo tipo do evento (ex.: ignitionOn, alarm)
   */
  @Get(['eventos', 'clientes/:clientId/eventos'])
  @ApiPublica('eventos')
  @Parametros(PERIODO, ['veiculoId', 'tipo', ...PAGINA])
  async eventos(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoId') veiculoId?: string,
    @Query('tipo') tipo?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaEventos> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const linhas = await this.monitoring.eventosParaApi(clientId, {
      ...p,
      assetId: uuidOpcional(veiculoId, 'veiculoId'),
      tipo: tipo ? tipo.slice(0, 60) : null,
      apos: aposInstante(lerCursor(cursor)),
      limite: lim,
    });
    return montarPagina(linhas, lim, (r) => ({ k: r.ts.toISOString(), id: String(r.id) }), paraEventoDto);
  }
}
