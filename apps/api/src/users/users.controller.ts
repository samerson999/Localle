import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { parsePerfilDoMembro } from '../permissions/dto/perfil.dto';
import type { BaseRole } from '../permissions/perfis.repository';
import { PerfisService } from '../permissions/perfis.service';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { parseConviteMembro } from './dto/create-team-user.dto';
import type { UserEntity } from './user.entity';
import { UsersService } from './users.service';

function toSafeUser(user: UserEntity) {
  // pendente: convidado que ainda não definiu a senha (convite em aberto)
  return { id: user.id, email: user.email, role: user.role, perfilId: user.perfil_id, ativo: user.desativado_em === null, pendente: user.password_hash === null, createdAt: user.created_at };
}

@Controller('users')
@UseGuards(PermissionsGuard)
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly perfis: PerfisService,
  ) {}

  /** Perfil próprio: confere que é deste cliente e devolve o papel-base que a pessoa assume. */
  private async resolverPerfil(clientId: string, p: ReturnType<typeof parsePerfilDoMembro>): Promise<{ role: BaseRole; perfilId: string | null }> {
    if (p.perfilId === null) return { role: p.role, perfilId: null };
    return { role: await this.perfis.baseRoleDe(clientId, p.perfilId), perfilId: p.perfilId };
  }

  @Get()
  @RequirePermission('permissoes.gerenciar')
  async findTeam(@ClientId() clientId: string) {
    const users = await this.service.findTeam(clientId);
    return users.map(toSafeUser);
  }

  /** Corpo: `{ email, perfil: 'gestor' | 'operador' | <id de perfil> }` (ou `role`). Sem SMTP, `codigo` volta para o admin repassar. */
  @Post()
  @RequirePermission('permissoes.gerenciar')
  async convidar(@ClientId() clientId: string, @CurrentUserId() actingAdminId: string, @Body() body: unknown) {
    const { email, perfil } = parseConviteMembro(body);
    const { user, conviteEnviado, codigo } = await this.service.convidarMembro(clientId, actingAdminId, { email, ...(await this.resolverPerfil(clientId, perfil)) });
    return { ...toSafeUser(user), conviteEnviado, codigo };
  }

  @Post(':id/convite')
  @RequirePermission('permissoes.gerenciar')
  reenviarConvite(@ClientId() clientId: string, @CurrentUserId() actingAdminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.reenviarConvite(clientId, actingAdminId, id);
  }

  /** Corpo: `{ perfil: 'gestor' | 'operador' | <id de perfil> }`. */
  @Put(':id/perfil')
  @RequirePermission('permissoes.gerenciar')
  async definirPerfil(
    @ClientId() clientId: string,
    @CurrentUserId() actingAdminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { perfil?: unknown },
  ) {
    const perfil = await this.resolverPerfil(clientId, parsePerfilDoMembro(body?.perfil));
    return toSafeUser(await this.service.definirPerfil(clientId, actingAdminId, id, perfil));
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
