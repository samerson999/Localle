import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { parseDate } from '../common/parse-date';
import { parseUuid } from '../common/parse-uuid';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { AlertasService } from './alertas.service';

const DIAS_PADRAO = 7;
const MAX_IDS = 500;

@Controller('alertas')
@UseGuards(PermissionsGuard)
export class AlertasController {
  constructor(private readonly service: AlertasService) {}

  /** Todos os abertos (qualquer data) + os tratados desde `desde` (padrão: 7 dias). */
  @Get()
  @RequirePermission('monitoramento.ver')
  listar(@ClientId() clientId: string, @Query('desde') desde?: string) {
    return this.service.listar(clientId, desde ? parseDate('desde', desde) : new Date(Date.now() - DIAS_PADRAO * 86_400_000));
  }

  /** Corpo `{ ids: [...] }` marca esses; `{ todos: true }` marca todos os não lidos do cliente. */
  @Post('lidos')
  @HttpCode(200)
  @RequirePermission('monitoramento.ver')
  marcarLidos(@ClientId() clientId: string, @Body() body: { ids?: unknown; todos?: unknown }) {
    if (body?.todos === true) return this.service.marcarLidos(clientId, null);
    if (!Array.isArray(body?.ids) || body.ids.length === 0 || body.ids.length > MAX_IDS) {
      throw new BadRequestException(`Informe "ids" (1 a ${MAX_IDS}) ou "todos": true`);
    }
    return this.service.marcarLidos(clientId, body.ids.map((id, i) => parseUuid(`ids[${i}]`, id)));
  }

  @Post(':id/tratar')
  @HttpCode(200)
  @RequirePermission('alertas.tratar')
  tratar(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { motivo?: unknown; obs?: unknown },
  ) {
    const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
    if (!motivo || motivo.length > 120) throw new BadRequestException('"motivo" é obrigatório (até 120 caracteres)');
    const obs = typeof body?.obs === 'string' && body.obs.trim() ? body.obs.trim().slice(0, 1000) : null;
    return this.service.tratar(clientId, userId, id, motivo, obs);
  }
}
