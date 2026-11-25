import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { CercasRepository } from '../../cercas/cercas.repository';
import { RegrasRepository } from '../../regras/regras.repository';
import { ApiPublica, ClienteDaChave } from '../auth/api-publica.decorator';
import { paginaUnica } from '../comum/periodo';
import { CercaDto, PaginaCercas, PaginaRegras, paraCercaDto, paraRegraDto } from './dto/cerca.dto';

/** Cercas eletrônicas e regras de alerta (escopo `cercas`). */
@Controller('v1')
export class CercasPublicoController {
  constructor(
    private readonly cercas: CercasRepository,
    private readonly regras: RegrasRepository,
  ) {}

  /** Cercas ativas, em GeoJSON. */
  @Get(['cercas', 'clientes/:clientId/cercas'])
  @ApiPublica('cercas')
  async listar(@ClienteDaChave() clientId: string): Promise<PaginaCercas> {
    return paginaUnica((await this.cercas.listar(clientId)).map(paraCercaDto));
  }

  @Get(['cercas/:id', 'clientes/:clientId/cercas/:id'])
  @ApiPublica('cercas')
  async buscar(@ClienteDaChave() clientId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CercaDto> {
    const c = await this.cercas.buscar(clientId, id);
    if (!c) throw new NotFoundException({ statusCode: 404, codigo: 'cerca_nao_encontrada', message: 'Cerca não encontrada' });
    return paraCercaDto(c);
  }

  /** Regras de alerta configuradas. */
  @Get(['regras', 'clientes/:clientId/regras'])
  @ApiPublica('cercas')
  async listarRegras(@ClienteDaChave() clientId: string): Promise<PaginaRegras> {
    return paginaUnica((await this.regras.listar(clientId)).map(paraRegraDto));
  }
}
