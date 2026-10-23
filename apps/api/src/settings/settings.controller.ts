import { BadRequestException, Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import type { SetSettingDto } from './dto/set-setting.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(PermissionsGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  // Sem @RequirePermission: ver os parâmetros vigentes é informativo, qualquer papel autenticado do
  // cliente pode — só alterar (`setup.configurar`) é privilegiado.
  @Get()
  findAll(@ClientId() clientId: string) {
    return this.service.resolveAll(clientId);
  }

  @Put(':key')
  @RequirePermission('setup.configurar')
  set(@ClientId() clientId: string, @Param('key') key: string, @Body() dto: SetSettingDto) {
    if (typeof dto.value !== 'number' || Number.isNaN(dto.value)) {
      throw new BadRequestException('"value" precisa ser um número');
    }
    return this.service.set(clientId, key, dto.value);
  }

  @Delete(':key')
  @RequirePermission('setup.configurar')
  restoreDefault(@ClientId() clientId: string, @Param('key') key: string) {
    return this.service.restoreDefault(clientId, key);
  }
}
