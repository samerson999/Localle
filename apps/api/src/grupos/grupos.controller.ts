import { Body, Controller, ConflictException, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { listaUuids, texto } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { GruposRepository } from './grupos.repository';

/** Ver grupos faz parte de ver ativos; criar/alterar exige `ativos.editar`. */
@Controller('grupos')
@UseGuards(PermissionsGuard)
export class GruposController {
  constructor(private readonly repo: GruposRepository) {}

  @Get()
  @RequirePermission('ativos.ver')
  listar(@ClientId() clientId: string) {
    return this.repo.listar(clientId);
  }

  @Post()
  @RequirePermission('ativos.editar')
  async criar(@ClientId() clientId: string, @Body() body: { name?: unknown }) {
    try {
      return await this.repo.criar(clientId, texto(body?.name, 'name', 80));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictException('Já existe um grupo com esse nome');
      throw err;
    }
  }

  @Put(':id')
  @RequirePermission('ativos.editar')
  async renomear(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { name?: unknown }) {
    let g;
    try {
      g = await this.repo.renomear(clientId, id, texto(body?.name, 'name', 80));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictException('Já existe um grupo com esse nome');
      throw err;
    }
    if (!g) throw new NotFoundException('Grupo não encontrado');
    return g;
  }

  @Put(':id/ativos')
  @RequirePermission('ativos.editar')
  async definirAtivos(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { assetIds?: unknown }) {
    const g = await this.repo.definirAtivos(clientId, id, listaUuids(body?.assetIds, 'assetIds'));
    if (!g) throw new NotFoundException('Grupo não encontrado');
    return g;
  }

  @Delete(':id')
  @RequirePermission('ativos.editar')
  @HttpCode(204)
  async remover(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.delete(clientId, id))) throw new NotFoundException('Grupo não encontrado');
  }
}
