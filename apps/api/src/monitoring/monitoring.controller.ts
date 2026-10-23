import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { parseDate } from '../common/parse-date';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import type { HistoryQueryDto } from './dto/history-query.dto';
import { MonitoringRepository } from './monitoring.repository';

@Controller('monitoring')
@UseGuards(PermissionsGuard)
@RequirePermission('monitoramento.ver')
export class MonitoringController {
  constructor(private readonly repo: MonitoringRepository) {}

  @Get('current')
  async current(@ClientId() clientId: string) {
    const rows = await this.repo.frotaAtual(clientId);
    return rows.map((r) => ({
      assetId: r.asset_id,
      plate: r.plate,
      // null = aguardando primeira posição (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.4), não erro.
      fixTime: r.fix_time,
      longitude: r.longitude,
      latitude: r.latitude,
      speedKmh: r.speed_kmh,
      ignition: r.ignition,
    }));
  }

  @Get('assets/:assetId/history')
  async history(@ClientId() clientId: string, @Param('assetId') assetId: string, @Query() query: HistoryQueryDto) {
    const from = parseDate('from', query.from);
    const to = parseDate('to', query.to);
    if (from > to) throw new BadRequestException('"from" não pode ser depois de "to"');

    const rows = await this.repo.historicoDoAtivo(clientId, assetId, from, to);
    return rows.map((r) => ({
      fixTime: r.fix_time,
      longitude: r.longitude,
      latitude: r.latitude,
      speedKmh: r.speed_kmh,
      course: r.course,
      valid: r.valid,
    }));
  }
}
