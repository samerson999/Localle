import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { parseUuid } from '../common/parse-uuid';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ComandosService } from './comandos.service';
import { parseComando, TIPOS_FISICOS } from './dto/parse-comando';

/**
 * Bloquear/desbloquear exige `comandos.bloquear` (admin por padrão); os demais, `comandos.enviar`. A
 * permissão é checada aqui, no envio (§ 4.6), por isso duas rotas em vez de uma só com `tipo` no corpo —
 * o guard decide pela chave da rota antes de ler o corpo.
 */
@Controller('comandos')
@UseGuards(PermissionsGuard)
export class ComandosController {
  constructor(private readonly service: ComandosService) {}

  @Get()
  @RequirePermission('monitoramento.ver')
  listar(@ClientId() clientId: string, @Query('assetId') assetId?: string) {
    return this.service.listar(clientId, assetId ? parseUuid('assetId', assetId) : null);
  }

  @Post()
  @RequirePermission('comandos.enviar')
  enviar(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: unknown) {
    const input = parseComando(body);
    if (TIPOS_FISICOS.includes(input.tipo)) throw new ForbiddenException('Bloqueio/desbloqueio: use POST /comandos/bloqueio');
    return this.service.solicitar(clientId, userId, input);
  }

  @Post('bloqueio')
  @RequirePermission('comandos.bloquear')
  bloquear(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: unknown) {
    const input = parseComando(body);
    if (!TIPOS_FISICOS.includes(input.tipo)) throw new BadRequestException('"tipo" precisa ser engineStop ou engineResume');
    return this.service.solicitar(clientId, userId, input);
  }
}
