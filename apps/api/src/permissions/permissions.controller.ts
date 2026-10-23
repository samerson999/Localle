import { BadRequestException, Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import type { Role } from '../auth/jwt';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import type { SetPermissionDto } from './dto/set-permission.dto';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';
import { RequirePermission } from './require-permission.decorator';

const VALID_ROLES: Role[] = ['admin', 'gestor', 'operador'];

@Controller('permissions')
@UseGuards(PermissionsGuard)
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get()
  @RequirePermission('permissoes.gerenciar')
  findAll(@ClientId() clientId: string) {
    return this.service.resolveAll(clientId);
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
