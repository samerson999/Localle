import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { CercasRepository } from './cercas.repository';
import { parseCerca } from './dto/cerca.dto';

/** Ler cercas é parte de ver o monitoramento (o mapa desenha as cercas); alterar exige `cercas.editar`. */
@Controller('cercas')
@UseGuards(PermissionsGuard)
export class CercasController {
  constructor(private readonly repo: CercasRepository) {}

  @Get()
  @RequirePermission('monitoramento.ver')
  listar(@ClientId() clientId: string) {
    return this.repo.listar(clientId);
  }

  @Post()
  @RequirePermission('cercas.editar')
  criar(@ClientId() clientId: string, @Body() body: unknown) {
    return this.repo.criar(clientId, parseCerca(body));
  }

  @Put(':id')
  @RequirePermission('cercas.editar')
  async atualizar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const cerca = await this.repo.atualizar(clientId, id, parseCerca(body));
    if (!cerca) throw new NotFoundException('Cerca não encontrada');
    return cerca;
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('cercas.editar')
  async remover(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.remover(clientId, id))) throw new NotFoundException('Cerca não encontrada');
  }
}
