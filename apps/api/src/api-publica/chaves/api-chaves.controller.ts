import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SuperadminGuard } from '../../auth/superadmin.guard';
import { CurrentUserId } from '../../clients/current-role.decorator';
import { uuid, uuidOpcional } from '../../common/validar';
import { ApiChavesService } from './api-chaves.service';

/** Console da Localle › API: chaves de acesso dos clientes (rota interna, só superadmin; fora do Swagger). */
@ApiExcludeController()
@Controller('superadmin/api-chaves')
@UseGuards(SuperadminGuard)
export class ApiChavesController {
  constructor(private readonly service: ApiChavesService) {}

  /** Todas as chaves, ou as de um cliente (`?clientId=`). */
  @Get()
  listar(@Query('clientId') clientId?: string) {
    return this.service.listar(uuidOpcional(clientId, 'clientId'));
  }

  /** Escopos que o contrato do cliente permite marcar. */
  @Get('escopos')
  escopos(@Query('clientId') clientId?: string) {
    return this.service.escoposDisponiveis(uuid(clientId, 'clientId'));
  }

  @Post()
  criar(@CurrentUserId() superadminId: string, @Body() body: { clientId?: unknown; nome?: unknown; escopos?: unknown; expiraEm?: unknown }) {
    return this.service.criar(superadminId, body);
  }

  @Post(':id/resetar')
  resetar(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.resetar(superadminId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async revogar(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.revogar(superadminId, id);
  }
}
