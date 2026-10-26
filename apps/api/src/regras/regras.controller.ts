import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { parseRegra } from './dto/regra.dto';
import { RegrasRepository } from './regras.repository';

@Controller('regras')
@UseGuards(PermissionsGuard)
export class RegrasController {
  constructor(private readonly repo: RegrasRepository) {}

  @Get()
  @RequirePermission('monitoramento.ver')
  listar(@ClientId() clientId: string) {
    return this.repo.listar(clientId);
  }

  @Post()
  @RequirePermission('regras.editar')
  criar(@ClientId() clientId: string, @Body() body: unknown) {
    return this.repo.criar(clientId, parseRegra(body));
  }

  @Put(':id')
  @RequirePermission('regras.editar')
  async atualizar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const regra = await this.repo.atualizar(clientId, id, parseRegra(body));
    if (!regra) throw new NotFoundException('Regra não encontrada');
    return regra;
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('regras.editar')
  async remover(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.remover(clientId, id))) throw new NotFoundException('Regra não encontrada');
  }
}
