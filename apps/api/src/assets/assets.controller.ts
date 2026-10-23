import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { AssetsRepository } from './assets.repository';
import type { CreateAssetDto } from './dto/create-asset.dto';

@Controller('assets')
@UseGuards(PermissionsGuard)
export class AssetsController {
  constructor(private readonly repo: AssetsRepository) {}

  @Get()
  @RequirePermission('ativos.ver')
  findAll(@ClientId() clientId: string) {
    return this.repo.findMany(clientId);
  }

  @Get(':id')
  @RequirePermission('ativos.ver')
  async findOne(@ClientId() clientId: string, @Param('id') id: string) {
    const asset = await this.repo.findOne(clientId, { id });
    if (!asset) throw new NotFoundException('Ativo não encontrado');
    return asset;
  }

  @Post()
  @RequirePermission('ativos.editar')
  create(@ClientId() clientId: string, @Body() dto: CreateAssetDto) {
    return this.repo.insert(clientId, { plate: dto.plate });
  }
}
