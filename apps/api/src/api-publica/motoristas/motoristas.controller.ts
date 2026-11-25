import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { MotoristaVinculosRepository } from '../../motoristas/motorista-vinculos.repository';
import { MotoristasRepository } from '../../motoristas/motoristas.repository';
import { vencimentosDosMotoristas } from '../../motoristas/vencimentos';
import { SettingsService } from '../../settings/settings.service';
import { ApiPublica, ClienteDaChave } from '../auth/api-publica.decorator';
import { aposInstante, lerCursor, lerLimite, montarPagina } from '../comum/paginacao';
import { JANELA, lerPeriodo, paginaUnica, uuidOpcional } from '../comum/periodo';
import { PERIODO, PAGINA, Parametros } from '../comum/parametros';
import { MotoristaDto, PaginaMotoristas, PaginaVencimentos, PaginaVinculos, paraMotoristaDto, paraVinculoDto } from './dto/motorista.dto';

/** Motoristas (escopo `frota`). As rotas fixas vêm antes de `motoristas/:id`. */
@Controller('v1')
export class MotoristasPublicoController {
  constructor(
    private readonly motoristas: MotoristasRepository,
    private readonly vinculos: MotoristaVinculosRepository,
    private readonly settings: SettingsService,
  ) {}

  /** Motoristas em ordem de nome. Desativados só com `incluirInativos=true`. */
  @Get(['motoristas', 'clientes/:clientId/motoristas'])
  @ApiPublica('frota')
  @Parametros([], ['incluirInativos'])
  async listar(@ClienteDaChave() clientId: string, @Query('incluirInativos') incluirInativos?: string): Promise<PaginaMotoristas> {
    return paginaUnica((await this.motoristas.listar(clientId, incluirInativos === 'true')).map(paraMotoristaDto));
  }

  /** CNH e toxicológico vencidos ou vencendo, pelos prazos de atenção e crítico do Setup. */
  @Get(['motoristas/vencimentos', 'clientes/:clientId/motoristas/vencimentos'])
  @ApiPublica('frota')
  async vencimentos(@ClienteDaChave() clientId: string): Promise<PaginaVencimentos> {
    const [atencao, critico, lista] = await Promise.all([
      this.settings.resolve(clientId, 'motoristas.cnh_atencao_dias'),
      this.settings.resolve(clientId, 'motoristas.cnh_critico_dias'),
      this.motoristas.listar(clientId, false),
    ]);
    return paginaUnica(vencimentosDosMotoristas(lista, atencao, critico).map(({ id, ...v }) => ({ motoristaId: id, ...v })));
  }

  /**
   * Quem esteve em qual veículo: os períodos que se sobrepõem a `de`–`ate` (máximo 31 dias), mais recentes primeiro.
   * @param de início do período, ISO 8601
   * @param ate fim do período, ISO 8601
   */
  @Get(['motoristas/vinculos', 'clientes/:clientId/motoristas/vinculos'])
  @ApiPublica('frota')
  @Parametros(PERIODO, ['veiculoId', 'motoristaId', ...PAGINA])
  async listarVinculos(
    @ClienteDaChave() clientId: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('veiculoId') veiculoId?: string,
    @Query('motoristaId') motoristaId?: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginaVinculos> {
    const p = lerPeriodo(de, ate, JANELA.padrao);
    const lim = lerLimite(limite);
    const c = lerCursor(cursor);
    const linhas = await this.vinculos.paginaParaApi(clientId, {
      ...p,
      assetId: uuidOpcional(veiculoId, 'veiculoId'),
      motoristaId: uuidOpcional(motoristaId, 'motoristaId'),
      apos: aposInstante(c),
      limite: lim,
    });
    return montarPagina(linhas, lim, (v) => ({ k: v.inicio.toISOString(), id: v.id }), paraVinculoDto);
  }

  @Get(['motoristas/:id', 'clientes/:clientId/motoristas/:id'])
  @ApiPublica('frota')
  async buscar(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<MotoristaDto> {
    const m = await this.motoristas.buscar(clientId, id);
    if (!m) throw new NotFoundException({ statusCode: 404, codigo: 'motorista_nao_encontrado', message: 'Motorista não encontrado' });
    return paraMotoristaDto(m);
  }
}
