import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AssetsRepository } from '../../assets/assets.repository';
import { FUSO_OPERACAO } from '../../monitoring/fuso-operacao';
import { MonitoringRepository } from '../../monitoring/monitoring.repository';
import { FrotaReportsService } from '../../reports/frota-reports.service';
import { ReportsRepository } from '../../reports/reports.repository';
import { SettingsService } from '../../settings/settings.service';
import { ApiPublica, ClienteDaChave } from '../auth/api-publica.decorator';
import { iso, JANELA, lerPeriodo, paginaUnica, uuidOpcional } from '../comum/periodo';
import { PERIODO, Parametros } from '../comum/parametros';
import {
  EpisodiosDto,
  PaginaCercasRelatorio,
  PaginaPassouPorAqui,
  PaginaUso,
  PaginaVelocidade,
  paraPassagemCerca,
  paraPassagemPonto,
  paraPercurso,
  paraTrecho,
  PercursoDto,
  QuilometragemDto,
} from './dto/relatorios.dto';

const erro = (codigo: string, message: string) => new BadRequestException({ statusCode: 400, codigo, message });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Relatórios da frota (vários veículos) calculam ponto a ponto: até 50 veículos por chamada, ou a frota toda em 7 dias. */
const MAX_VEICULOS = 50;
const JANELA_FROTA_TODA = 7;

function numero(v: unknown, campo: string, min: number, max: number): number {
  const n = Number(v);
  if (v === undefined || v === '' || !Number.isFinite(n) || n < min || n > max) throw erro('parametro_invalido', `"${campo}" precisa ser um número de ${min} a ${max}`);
  return n;
}

/** Relatórios calculados sobre as posições (escopo `relatorios`). */
@Controller('v1')
export class RelatoriosController {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly frota: FrotaReportsService,
    private readonly monitoring: MonitoringRepository,
    private readonly settings: SettingsService,
    private readonly assets: AssetsRepository,
  ) {}

  /**
   * Quilometragem de um veículo no período (máximo 31 dias), pelo odômetro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['relatorios/quilometragem', 'clientes/:clientId/relatorios/quilometragem'])
  @ApiPublica('relatorios')
  @Parametros(['veiculoId', ...PERIODO])
  async quilometragem(@ClienteDaChave() clientId: string, @Query('veiculoId') veiculoId?: string, @Query('de') de?: string, @Query('ate') ate?: string): Promise<QuilometragemDto> {
    const id = await this.veiculoObrigatorio(clientId, veiculoId);
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const r = await this.reports.kmPorAtivo(clientId, id, p.de, p.ate);
    return {
      veiculoId: id,
      primeiraLeitura: iso(r?.desde),
      ultimaLeitura: iso(r?.ate),
      distanciaKm: r?.distancia_m == null ? null : Math.round(r.distancia_m) / 1000,
      amostras: r?.amostras ?? 0,
    };
  }

  /**
   * Excessos de velocidade de um veículo no período (máximo 31 dias), pelo limite e duração mínima do Setup.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['relatorios/excessos-velocidade', 'clientes/:clientId/relatorios/excessos-velocidade'])
  @ApiPublica('relatorios')
  @Parametros(['veiculoId', ...PERIODO])
  async excessos(@ClienteDaChave() clientId: string, @Query('veiculoId') veiculoId?: string, @Query('de') de?: string, @Query('ate') ate?: string): Promise<EpisodiosDto> {
    const id = await this.veiculoObrigatorio(clientId, veiculoId);
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const [limitePorAtivo, duracaoMin] = await Promise.all([
      this.settings.resolveMenorPorAtivo(clientId, 'monitoramento.velocidade_limite_kmh'),
      this.settings.resolve(clientId, 'monitoramento.excesso_episodio_min_s'),
    ]);
    const limiteKmh = limitePorAtivo(id);
    const eps = await this.reports.excessosPorAtivo(clientId, id, p.de, p.ate, limiteKmh, duracaoMin);
    return {
      veiculoId: id,
      limiteKmh,
      episodios: eps.map((e) => ({
        inicio: e.inicio.toISOString(),
        fim: e.fim.toISOString(),
        duracaoMin: Math.round(((e.fim.getTime() - e.inicio.getTime()) / 60_000) * 10) / 10,
        velocidadeMaxKmh: e.velocidade_max,
        amostras: e.amostras,
      })),
    };
  }

  /**
   * Paradas de um veículo no período (máximo 31 dias), acima da duração mínima do Setup.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['relatorios/paradas', 'clientes/:clientId/relatorios/paradas'])
  @ApiPublica('relatorios')
  @Parametros(['veiculoId', ...PERIODO])
  async paradas(@ClienteDaChave() clientId: string, @Query('veiculoId') veiculoId?: string, @Query('de') de?: string, @Query('ate') ate?: string): Promise<EpisodiosDto> {
    const id = await this.veiculoObrigatorio(clientId, veiculoId);
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const duracaoMin = await this.settings.resolve(clientId, 'monitoramento.parada_min_duracao_min');
    const eps = await this.reports.paradasPorAtivo(clientId, id, p.de, p.ate, duracaoMin);
    return {
      veiculoId: id,
      episodios: eps.map((e) => ({
        inicio: e.inicio.toISOString(),
        fim: e.fim.toISOString(),
        duracaoMin: Math.round(((e.fim.getTime() - e.inicio.getTime()) / 60_000) * 10) / 10,
        amostras: e.amostras,
      })),
    };
  }

  /**
   * Resumo do percurso de um veículo no período (máximo 31 dias): distância, tempos e paradas.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['veiculos/:id/percurso', 'clientes/:clientId/veiculos/:id/percurso'])
  @ApiPublica('relatorios')
  @Parametros(PERIODO)
  async percurso(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Query('de') de?: string, @Query('ate') ate?: string): Promise<PercursoDto> {
    await this.veiculoObrigatorio(clientId, id);
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const [r] = await this.frota.percurso(clientId, [id], { from: p.de, to: p.ate });
    if (!r) return { veiculoId: id, posicoes: 0, distanciaKm: 0, emMovimentoMin: 0, motorLigadoMin: null, ociosoMin: null, velocidadeMaxKmh: 0, paradas: [] };
    return paraPercurso(id, r.posicoes, r.stats);
  }

  /**
   * Trechos em que cada veículo andou na velocidade mínima pedida ou acima.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   * @param veiculoIds até 50, separados por vírgula; sem eles, a frota toda (período máximo 7 dias)
   * @param velocidadeMin em km/h (padrão 0)
   */
  @Get(['relatorios/velocidade', 'clientes/:clientId/relatorios/velocidade'])
  @ApiPublica('relatorios')
  @Parametros(PERIODO, ['veiculoIds', 'velocidadeMin'])
  async velocidade(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoIds') veiculoIds?: string,
    @Query('velocidadeMin') velocidadeMin?: string,
  ): Promise<PaginaVelocidade> {
    const { ids, p } = this.escopoFrota(veiculoIds, de, ate);
    const min = velocidadeMin === undefined ? 0 : numero(velocidadeMin, 'velocidadeMin', 0, 300);
    const r = await this.frota.velocidade(clientId, ids, { from: p.de, to: p.ate }, min);
    return paginaUnica(r.map((v) => ({ veiculoId: v.assetId, placa: v.plate, trechos: v.legs.map(paraTrecho) })));
  }

  /**
   * Entradas e saídas de cerca de cada veículo.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   * @param veiculoIds até 50, separados por vírgula; sem eles, a frota toda (período máximo 7 dias)
   */
  @Get(['relatorios/cercas', 'clientes/:clientId/relatorios/cercas'])
  @ApiPublica('relatorios')
  @Parametros(PERIODO, ['veiculoIds', 'cercaId'])
  async cercas(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoIds') veiculoIds?: string,
    @Query('cercaId') cercaId?: string,
  ): Promise<PaginaCercasRelatorio> {
    const { ids, p } = this.escopoFrota(veiculoIds, de, ate);
    const r = await this.frota.cercas(clientId, ids, { from: p.de, to: p.ate }, uuidOpcional(cercaId, 'cercaId'));
    return paginaUnica(r.map((v) => ({ veiculoId: v.assetId, placa: v.plate, passagens: v.passagens.map(paraPassagemCerca) })));
  }

  /**
   * Veículos que passaram a até `raio` metros de um ponto.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   * @param raio em metros (10 a 5.000)
   * @param veiculoIds até 50, separados por vírgula; sem eles, a frota toda (período máximo 7 dias)
   */
  @Get(['relatorios/passou-por-aqui', 'clientes/:clientId/relatorios/passou-por-aqui'])
  @ApiPublica('relatorios')
  @Parametros(['latitude', 'longitude', 'raio', ...PERIODO], ['veiculoIds'])
  async passouPorAqui(
    @ClienteDaChave() clientId: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('raio') raio?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoIds') veiculoIds?: string,
  ): Promise<PaginaPassouPorAqui> {
    const lat = numero(latitude, 'latitude', -90, 90);
    const lon = numero(longitude, 'longitude', -180, 180);
    const r = numero(raio, 'raio', 10, 5000);
    const { ids, p } = this.escopoFrota(veiculoIds, de, ate);
    const lista = await this.frota.passouPorAqui(clientId, ids, { from: p.de, to: p.ate }, [lat, lon], r);
    return paginaUnica(lista.map((v) => ({ veiculoId: v.assetId, placa: v.plate, passagens: v.passagens.map(paraPassagemPonto) })));
  }

  /**
   * Distância e tempo em movimento por veículo e por dia, de `dias` dias atrás até hoje (no fuso da operação).
   * @param dias quantos dias antes de hoje (0 a 30; padrão 7)
   */
  @Get(['relatorios/uso', 'clientes/:clientId/relatorios/uso'])
  @ApiPublica('relatorios')
  @Parametros([], ['dias'])
  async uso(@ClienteDaChave() clientId: string, @Query('dias') dias?: string): Promise<PaginaUso> {
    const n = dias === undefined ? 7 : numero(dias, 'dias', 0, 30);
    const linhas = await this.monitoring.usoDiario(clientId, new Date(), Math.floor(n), FUSO_OPERACAO);
    return paginaUnica(linhas.map((u) => ({ veiculoId: u.asset_id, dia: u.dia, distanciaKm: Math.round(u.dist_m / 100) / 10, emMovimentoMin: u.minutos_mov })));
  }

  /** `veiculoId` obrigatório e do cliente (404 se for de outro). */
  private async veiculoObrigatorio(clientId: string, veiculoId: string | undefined): Promise<string> {
    if (!veiculoId || !UUID.test(veiculoId)) throw erro('parametro_invalido', '"veiculoId" é obrigatório e precisa ser um UUID');
    if (!(await this.assets.findOne(clientId, { id: veiculoId }))) {
      throw new NotFoundException({ statusCode: 404, codigo: 'veiculo_nao_encontrado', message: 'Veículo não encontrado' });
    }
    return veiculoId;
  }

  /** Lista de veículos (até 50) com período de até 31 dias, ou a frota toda com até 7 dias. */
  private escopoFrota(veiculoIds: string | undefined, de: string | undefined, ate: string | undefined) {
    if (!veiculoIds) return { ids: null, p: lerPeriodo(de, ate, JANELA_FROTA_TODA) };
    const ids = [...new Set(veiculoIds.split(',').map((x) => x.trim()).filter(Boolean))];
    if (ids.length > MAX_VEICULOS) throw erro('veiculos_demais', `No máximo ${MAX_VEICULOS} veículos por chamada`);
    if (ids.some((x) => !UUID.test(x))) throw erro('parametro_invalido', '"veiculoIds" precisa ser uma lista de UUIDs separados por vírgula');
    return { ids, p: lerPeriodo(de, ate, JANELA.padrao) };
  }
}
