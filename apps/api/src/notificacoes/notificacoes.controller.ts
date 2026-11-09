import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, Put, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { validarEndpointPush } from './endpoint-push';
import { NotificacaoAparelhosRepository, NotificacaoPreferenciasRepository } from './notificacoes.repository';
import { vapidConfig } from './vapid';

const MAX_TIPO = 60;
const MAX_USER_AGENT = 300;

/**
 * Autoatendimento: cada usuário gerencia só os próprios aparelhos/preferências — nenhuma rota aqui
 * recebe `userId` do corpo, sempre `@CurrentUserId()` do JWT. Por isso não há `@RequirePermission`:
 * o `AuthGuard` global já exige login, e não há papel que deva ficar de fora do próprio push.
 */
@Controller('notificacoes')
@UseGuards(PermissionsGuard)
export class NotificacoesController {
  constructor(
    private readonly aparelhos: NotificacaoAparelhosRepository,
    private readonly preferencias: NotificacaoPreferenciasRepository,
  ) {}

  @Get('chave-publica')
  chavePublica() {
    const vapid = vapidConfig();
    if (!vapid) throw new ServiceUnavailableException('Notificações push ainda não configuradas neste ambiente');
    return { publicKey: vapid.publicKey };
  }

  @Post('aparelhos')
  async registrarAparelho(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @Body() body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; userAgent?: unknown },
  ) {
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    if (!endpoint) throw new BadRequestException('"endpoint" é obrigatório (URL https)');
    const motivoRecusa = validarEndpointPush(endpoint);
    if (motivoRecusa) throw new BadRequestException(motivoRecusa);
    const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : null;
    const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : null;
    const userAgent = typeof body?.userAgent === 'string' ? body.userAgent.slice(0, MAX_USER_AGENT) : null;
    const aparelho = await this.aparelhos.registrar(clientId, { userId, canal: 'webpush', endpoint, p256dh, auth, userAgent });
    return { id: aparelho.id };
  }

  @Delete('aparelhos')
  @HttpCode(200)
  async removerAparelho(@ClientId() clientId: string, @Body() body: { endpoint?: unknown }) {
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    if (!endpoint) throw new BadRequestException('"endpoint" é obrigatório');
    const removido = await this.aparelhos.remover(clientId, endpoint);
    return { removido };
  }

  @Get('preferencias')
  async listarPreferencias(@ClientId() clientId: string, @CurrentUserId() userId: string) {
    const rows = await this.preferencias.listar(clientId, userId);
    return rows.map((r) => ({ tipo: r.tipo, ativo: r.ativo }));
  }

  @Put('preferencias')
  @HttpCode(200)
  async definirPreferencia(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @Body() body: { tipo?: unknown; ativo?: unknown },
  ) {
    const tipo = typeof body?.tipo === 'string' ? body.tipo.trim() : '';
    if (!tipo || tipo.length > MAX_TIPO) throw new BadRequestException(`"tipo" é obrigatório (até ${MAX_TIPO} caracteres)`);
    if (typeof body?.ativo !== 'boolean') throw new BadRequestException('"ativo" é obrigatório (boolean)');
    await this.preferencias.definir(clientId, userId, tipo, body.ativo);
    return { ok: true };
  }
}
