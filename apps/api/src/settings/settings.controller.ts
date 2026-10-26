import { BadRequestException, Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { parseUuid } from '../common/parse-uuid';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { SettingsService } from './settings.service';

const grupo = (v: unknown) => (typeof v === 'string' && v ? parseUuid('groupId', v) : null);
const motivo = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null);

/** `?groupId=` em qualquer rota muda a camada: sem ele, Empresa (cliente); com ele, o grupo de ativos. */
@Controller('settings')
@UseGuards(PermissionsGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  // Sem @RequirePermission: ver os parâmetros vigentes é informativo, qualquer papel autenticado do
  // cliente pode — só alterar (`setup.configurar`) é privilegiado.
  @Get()
  findAll(@ClientId() clientId: string, @Query('groupId') groupId?: string) {
    return this.service.resolveAll(clientId, grupo(groupId));
  }

  @Get(':key/historico')
  historico(@ClientId() clientId: string, @Param('key') key: string, @Query('groupId') groupId?: string) {
    return this.service.historico(clientId, key, grupo(groupId));
  }

  @Put(':key')
  @RequirePermission('setup.configurar')
  set(@ClientId() clientId: string, @CurrentUserId() userId: string, @Param('key') key: string, @Body() body: { value?: unknown; groupId?: unknown; reason?: unknown }) {
    const value = body?.value;
    if (!(typeof value === 'number' && !Number.isNaN(value)) && typeof value !== 'string') {
      throw new BadRequestException('"value" precisa ser um número ou uma opção');
    }
    return this.service.set(clientId, key, value, { groupId: grupo(body?.groupId), userId, reason: motivo(body?.reason) });
  }

  @Delete(':key')
  @RequirePermission('setup.configurar')
  restoreDefault(@ClientId() clientId: string, @CurrentUserId() userId: string, @Param('key') key: string, @Query('groupId') groupId?: string) {
    return this.service.restoreDefault(clientId, key, { groupId: grupo(groupId), userId });
  }
}
