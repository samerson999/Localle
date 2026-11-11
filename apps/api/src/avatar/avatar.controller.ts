import { Body, Controller, Delete, Get, HttpCode, Logger, Put, UseGuards } from '@nestjs/common';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { parseAvatar } from './avatar';
import { AvatarRepository } from './avatar.repository';

/**
 * Foto do avatar do próprio usuário (Minha conta). Sem id no path: o dono sai sempre do JWT (`AuthGuard` global),
 * então não há como ler ou trocar a foto de outra pessoa. Usuário de cliente em /auth/avatar; equipe da Localle em
 * /superadmin/avatar (mesma divisão de /auth/senha × /superadmin/senha).
 */
@Controller()
export class AvatarController {
  private readonly logger = new Logger(AvatarController.name);
  constructor(private readonly avatares: AvatarRepository) {}

  @Get('auth/avatar')
  async ler(@ClientId() clientId: string, @CurrentUserId() userId: string) {
    return { imagem: await this.avatares.doUsuario(clientId, userId) };
  }

  @Put('auth/avatar')
  @HttpCode(204)
  async salvar(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: { imagem?: unknown }) {
    const imagem = parseAvatar(body?.imagem);
    await this.avatares.salvarDoUsuario(clientId, userId, imagem);
    this.logger.log(`avatar atualizado: user=${userId} client=${clientId} chars=${imagem.length}`);
  }

  @Delete('auth/avatar')
  @HttpCode(204)
  async remover(@ClientId() clientId: string, @CurrentUserId() userId: string) {
    await this.avatares.removerDoUsuario(clientId, userId);
    this.logger.log(`avatar removido: user=${userId} client=${clientId}`);
  }

  @Get('superadmin/avatar')
  @UseGuards(SuperadminGuard)
  async lerSuperadmin(@CurrentUserId() superadminId: string) {
    return { imagem: await this.avatares.doSuperadmin(superadminId) };
  }

  @Put('superadmin/avatar')
  @UseGuards(SuperadminGuard)
  @HttpCode(204)
  async salvarSuperadmin(@CurrentUserId() superadminId: string, @Body() body: { imagem?: unknown }) {
    const imagem = parseAvatar(body?.imagem);
    await this.avatares.salvarDoSuperadmin(superadminId, imagem);
    this.logger.log(`avatar atualizado: superadmin=${superadminId} chars=${imagem.length}`);
  }

  @Delete('superadmin/avatar')
  @UseGuards(SuperadminGuard)
  @HttpCode(204)
  async removerSuperadmin(@CurrentUserId() superadminId: string) {
    await this.avatares.removerDoSuperadmin(superadminId);
    this.logger.log(`avatar removido: superadmin=${superadminId}`);
  }
}
