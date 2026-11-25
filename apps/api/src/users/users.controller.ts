import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { parseSenha } from '../auth/dto/parse-codigo';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { parsePerfilDoMembro } from '../permissions/dto/perfil.dto';
import type { BaseRole } from '../permissions/perfis.repository';
import { PerfisService } from '../permissions/perfis.service';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { parseEscopo, parseNovoMembro } from './dto/create-team-user.dto';
import type { UserEntity } from './user.entity';
import type { MembroComEscopo } from './users.repository';
import { UsersService } from './users.service';

function toSafeUser(user: UserEntity) {
  // pendente: convidado antigo (por e-mail) que ainda não definiu a senha
  return {
    id: user.id,
    email: user.email,
    usuario: user.username,
    role: user.role,
    perfilId: user.perfil_id,
    ativo: user.desativado_em === null,
    pendente: user.password_hash === null,
    createdAt: user.created_at,
  };
}

const comEscopo = (u: MembroComEscopo) => ({
  ...toSafeUser(u),
  escopo: { restrito: u.escopo_restrito, semGrupo: u.escopo_sem_grupo, grupoIds: u.grupo_ids, operacaoIds: u.operacao_ids },
});

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
    return (await this.service.findTeam(clientId)).map(comEscopo);
  }

  /** Corpo: `{ usuario, senha, perfil: 'gestor' | 'operador' | <id de perfil>, escopo? }`. */
  @Post()
  @RequirePermission('permissoes.gerenciar')
  async criar(@ClientId() clientId: string, @CurrentUserId() actingAdminId: string, @Body() body: unknown) {
    const { username, senha, perfil, escopo } = parseNovoMembro(body);
    const user = await this.service.criarMembro(clientId, actingAdminId, { username, senha, escopo, ...(await this.resolverPerfil(clientId, perfil)) });
    return toSafeUser(user);
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

  /** Corpo: `{ restrito, semGrupo?, grupoIds?, operacaoIds? }`. */
  @Put(':id/escopo')
  @RequirePermission('permissoes.gerenciar')
  definirEscopo(@ClientId() clientId: string, @CurrentUserId() actingAdminId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.service.definirEscopo(clientId, actingAdminId, id, parseEscopo(body));
  }

  /** Corpo: `{ senha }`. */
  @Put(':id/senha')
  @HttpCode(204)
  @RequirePermission('permissoes.gerenciar')
  async definirSenha(@ClientId() clientId: string, @CurrentUserId() actingAdminId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { senha?: unknown }) {
    await this.service.definirSenha(clientId, actingAdminId, id, parseSenha(body?.senha, 'senha'));
  }

  @Post(':id/desativar')
  @RequirePermission('permissoes.gerenciar')
  async desativar(@ClientId() clientId: string, @CurrentUserId() actingAdminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return toSafeUser(await this.service.setAtivo(clientId, actingAdminId, id, false));
  }

  @Post(':id/reativar')
  @RequirePermission('permissoes.gerenciar')
  async reativar(@ClientId() clientId: string, @CurrentUserId() actingAdminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return toSafeUser(await this.service.setAtivo(clientId, actingAdminId, id, true));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('permissoes.gerenciar')
  async excluir(@ClientId() clientId: string, @CurrentUserId() actingAdminId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.excluir(clientId, actingAdminId, id);
  }
}
