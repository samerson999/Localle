import { ApiExcludeController } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SuperadminGuard } from '../../auth/superadmin.guard';
import { CurrentUserId } from '../../clients/current-role.decorator';
import { ApiChavesMestrasService } from './api-chaves-mestras.service';

/** Console da Localle: chaves mestras da API pública e o registro de cada consulta feita com elas. */
// rota interna ou só da chave mestra: fora do Swagger da API pública (decisão 23/11)
@ApiExcludeController()
@Controller('superadmin/api-chaves-mestras')
@UseGuards(SuperadminGuard)
export class ApiChavesMestrasController {
  constructor(private readonly service: ApiChavesMestrasService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Get(':id/acessos')
  acessos(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.acessos(id);
  }

  @Post()
  criar(@CurrentUserId() superadminId: string, @Body() body: { nome?: unknown; ips?: unknown; expiraEm?: unknown }) {
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
