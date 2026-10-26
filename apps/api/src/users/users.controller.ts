import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import type { CreateTeamUserDto } from './dto/create-team-user.dto';
import type { UserEntity } from './user.entity';
import { UsersService } from './users.service';

function toSafeUser(user: UserEntity) {
  return { id: user.id, email: user.email, role: user.role, ativo: user.desativado_em === null, createdAt: user.created_at };
}

@Controller('users')
@UseGuards(PermissionsGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @RequirePermission('permissoes.gerenciar')
  async findTeam(@ClientId() clientId: string) {
    const users = await this.service.findTeam(clientId);
    return users.map(toSafeUser);
  }

  @Post()
  @RequirePermission('permissoes.gerenciar')
  async create(
    @ClientId() clientId: string,
    @CurrentUserId() actingAdminId: string,
    @Body() dto: CreateTeamUserDto,
  ) {
    const user = await this.service.createTeamMember(clientId, actingAdminId, dto);
    return toSafeUser(user);
  }

  @Post(':id/desativar')
  @RequirePermission('permissoes.gerenciar')
  async desativar(
    @ClientId() clientId: string,
    @CurrentUserId() actingAdminId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return toSafeUser(await this.service.setAtivo(clientId, actingAdminId, id, false));
  }

  @Post(':id/reativar')
  @RequirePermission('permissoes.gerenciar')
  async reativar(
    @ClientId() clientId: string,
    @CurrentUserId() actingAdminId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return toSafeUser(await this.service.setAtivo(clientId, actingAdminId, id, true));
  }
}
