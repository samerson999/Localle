import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { AtivosVisiveis } from '../escopo/ativos-visiveis.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { AssetsRepository } from './assets.repository';
import type { CreateAssetDto } from './dto/create-asset.dto';
import { parseCreateAsset, parseUpdateAsset, type UpdateAssetDto } from './dto/update-asset.dto';

@Controller('assets')
@UseGuards(PermissionsGuard)
export class AssetsController {
  constructor(private readonly repo: AssetsRepository) {}

  /** Vendidos e baixados ficam fora por padrão (PRODUCT.md, "Incluir inativos"). */
  @Get()
  @RequirePermission('ativos.ver')
  async findAll(@ClientId() clientId: string, @AtivosVisiveis() ativos: ReadonlySet<string> | null, @Query('incluirInativos') incluirInativos?: string) {
    const lista = incluirInativos === 'true' ? await this.repo.findMany(clientId) : await this.repo.findMany(clientId, { status: 'ativo' });
    // o ativo carrega `id`, não `assetId` — o escopo do usuário é aplicado aqui (src/escopo/escopo.ts)
    return ativos ? lista.filter((a) => ativos.has(a.id)) : lista;
  }

  @Get(':id')
  @RequirePermission('ativos.ver')
  async findOne(@ClientId() clientId: string, @AtivosVisiveis() ativos: ReadonlySet<string> | null, @Param('id', ParseUUIDPipe) id: string) {
    const asset = ativos && !ativos.has(id) ? null : await this.repo.findOne(clientId, { id });
    if (!asset) throw new NotFoundException('Ativo não encontrado');
    return asset;
  }

  @Post()
  @RequirePermission('ativos.editar')
  create(@ClientId() clientId: string, @Body() dto: CreateAssetDto) {
    return this.repo.insert(clientId, { ...parseCreateAsset(dto) });
  }

  @Patch(':id')
  @RequirePermission('ativos.editar')
  async update(@ClientId() clientId: string, @AtivosVisiveis() ativos: ReadonlySet<string> | null, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssetDto) {
    if (ativos && !ativos.has(id)) throw new NotFoundException('Ativo não encontrado');
    const asset = await this.repo.atualizar(clientId, id, parseUpdateAsset(dto));
    if (asset === 'motorista_invalido') throw new BadRequestException('Motorista não encontrado ou desativado');
    if (asset === 'operacao_invalida') throw new BadRequestException('Operação não encontrada');
    if (asset === 'modelo_invalido') throw new BadRequestException('Modelo não encontrado');
    if (asset === 'sem_identificacao') throw new BadRequestException('O ativo precisa de placa ou identificador (código interno ou nº de série)');
    if (!asset) throw new NotFoundException('Ativo não encontrado');
    return asset;
  }
}
