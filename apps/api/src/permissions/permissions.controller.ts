import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { Role } from '../auth/jwt';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { parseNovoPerfil, parseRenomearPerfil } from './dto/perfil.dto';
import type { SetPermissionDto } from './dto/set-permission.dto';
import { PerfisService } from './perfis.service';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';
import { RequirePermission } from './require-permission.decorator';

const VALID_ROLES: Role[] = ['admin', 'gestor', 'operador'];

@Controller('permissions')
@UseGuards(PermissionsGuard)
export class PermissionsController {
  constructor(
    private readonly service: PermissionsService,
    private readonly perfis: PerfisService,
  ) {}

  @Get()
  @RequirePermission('permissoes.gerenciar')
  findAll(@ClientId() clientId: string) {
    return this.service.resolveAll(clientId);
  }

  // ---- perfis próprios do cliente (rotas antes de ':role/:key', que capturaria "perfis") ----

  @Get('perfis')
  @RequirePermission('permissoes.gerenciar')
  listarPerfis(@ClientId() clientId: string) {
    return this.perfis.listar(clientId);
  }

  @Post('perfis')
  @RequirePermission('permissoes.gerenciar')
  criarPerfil(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: unknown) {
    return this.perfis.criar(clientId, userId, parseNovoPerfil(body));
  }

  @Patch('perfis/:id')
  @RequirePermission('permissoes.gerenciar')
  renomearPerfil(@ClientId() clientId: string, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.perfis.renomear(clientId, userId, id, parseRenomearPerfil(body));
  }

  @Delete('perfis/:id')
  @HttpCode(204)
  @RequirePermission('permissoes.gerenciar')
  async excluirPerfil(@ClientId() clientId: string, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.perfis.excluir(clientId, userId, id);
  }

  @Put('perfis/:id/:key')
  @RequirePermission('permissoes.gerenciar')
  definirDoPerfil(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('key') key: string,
    @Body() dto: SetPermissionDto,
  ) {
    if (typeof dto?.allowed !== 'boolean') throw new BadRequestException('"allowed" precisa ser booleano');
    return this.perfis.definirPermissao(clientId, userId, id, key, dto.allowed);
  }

  @Delete('perfis/:id/:key')
  @RequirePermission('permissoes.gerenciar')
  padraoDoPerfil(@ClientId() clientId: string, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Param('key') key: string) {
    return this.perfis.definirPermissao(clientId, userId, id, key, null);
  }

  @Put(':role/:key')
  @RequirePermission('permissoes.gerenciar')
  set(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @Param('role') role: string,
    @Param('key') key: string,
    @Body() dto: SetPermissionDto,
  ) {
    if (!VALID_ROLES.includes(role as Role)) throw new BadRequestException('Papel inválido');
    if (typeof dto.allowed !== 'boolean') throw new BadRequestException('"allowed" precisa ser booleano');
    return this.service.set(clientId, role as Role, key, dto.allowed, userId);
  }

  @Delete(':role/:key')
  @RequirePermission('permissoes.gerenciar')
  restoreDefault(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @Param('role') role: string,
    @Param('key') key: string,
  ) {
    if (!VALID_ROLES.includes(role as Role)) throw new BadRequestException('Papel inválido');
    return this.service.restoreDefault(clientId, role as Role, key, userId);
  }
}
