import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { AssetsRepository } from './assets.repository';
import type { CreateAssetDto } from './dto/create-asset.dto';
import { parsePlate, parseUpdateAsset, type UpdateAssetDto } from './dto/update-asset.dto';

@Controller('assets')
@UseGuards(PermissionsGuard)
export class AssetsController {
  constructor(private readonly repo: AssetsRepository) {}

  /** Vendidos e baixados ficam fora por padrão (PRODUCT.md, "Incluir inativos"). */
  @Get()
  @RequirePermission('ativos.ver')
  findAll(@ClientId() clientId: string, @Query('incluirInativos') incluirInativos?: string) {
    return incluirInativos === 'true' ? this.repo.findMany(clientId) : this.repo.findMany(clientId, { status: 'ativo' });
  }

  @Get(':id')
  @RequirePermission('ativos.ver')
  async findOne(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    const asset = await this.repo.findOne(clientId, { id });
    if (!asset) throw new NotFoundException('Ativo não encontrado');
    return asset;
  }

  @Post()
  @RequirePermission('ativos.editar')
  create(@ClientId() clientId: string, @Body() dto: CreateAssetDto) {
    return this.repo.insert(clientId, { plate: parsePlate(dto?.plate) });
  }

  @Patch(':id')
  @RequirePermission('ativos.editar')
  async update(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssetDto) {
    const asset = await this.repo.atualizar(clientId, id, parseUpdateAsset(dto));
    if (asset === 'motorista_invalido') throw new BadRequestException('Motorista não encontrado ou desativado');
    if (!asset) throw new NotFoundException('Ativo não encontrado');
    return asset;
  }
}
