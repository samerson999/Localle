import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AssetsRepository } from '../../assets/assets.repository';
import { ApiPublica, ClienteDaChave } from '../auth/api-publica.decorator';
import { lerCursor, lerLimite, montarPagina } from '../comum/paginacao';
import { PAGINA, Parametros } from '../comum/parametros';
import { PaginaVeiculos, paraVeiculoDto, VeiculoDto } from './dto/veiculo.dto';

/**
 * Veículos do cliente. Cada rota atende os dois caminhos: o da chave de cliente e o `clientes/:clientId/...` da chave
 * mestra (o guard decide de onde vem o cliente; o segundo caminho nunca aparece no Swagger).
 */
@Controller('v1')
export class VeiculosController {
  constructor(private readonly assets: AssetsRepository) {}

  /**
   * Lista os veículos, em ordem de nome. Vendidos e baixados só com `incluirInativos=true`.
   * @param placa filtra pela placa (com ou sem hífen)
   * @param identificador filtra pelo código interno
   */
  @Get(['veiculos', 'clientes/:clientId/veiculos'])
  @ApiPublica('frota')
  @Parametros([], ['placa', 'identificador', 'incluirInativos', ...PAGINA])
  async listar(
    @ClienteDaChave() clientId: string,
    @Query('limite') limite?: string,
    @Query('cursor') cursor?: string,
    @Query('incluirInativos') incluirInativos?: string,
    @Query('placa') placa?: string,
    @Query('identificador') identificador?: string,
  ): Promise<PaginaVeiculos> {
    const lim = lerLimite(limite);
    const c = lerCursor(cursor);
    const linhas = await this.assets.paginaParaApi(clientId, {
      limite: lim,
      apos: c ? { rotulo: c.k, id: c.id } : null,
      incluirInativos: incluirInativos === 'true',
      placa: placa?.slice(0, 20) || undefined,
      identificador: identificador?.slice(0, 80) || undefined,
    });
    return montarPagina(linhas, lim, (a) => ({ k: a.rotulo, id: a.id }), paraVeiculoDto);
  }

  /** Um veículo, inclusive vendido ou baixado. */
  @Get(['veiculos/:id', 'clientes/:clientId/veiculos/:id'])
  @ApiPublica('frota')
  async buscar(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<VeiculoDto> {
    const [a] = await this.assets.paginaParaApi(clientId, { limite: 1, apos: null, incluirInativos: true, id });
    if (!a) throw new NotFoundException({ statusCode: 404, codigo: 'veiculo_nao_encontrado', message: 'Veículo não encontrado' });
    return paraVeiculoDto(a);
  }
}
