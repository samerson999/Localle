import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { parseDate } from '../common/parse-date';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { SettingsService } from '../settings/settings.service';
import type { AssetPeriodQueryDto } from './dto/asset-period-query.dto';
import { ReportsRepository } from './reports.repository';

@Controller('reports')
@UseGuards(PermissionsGuard)
@RequirePermission('relatorios.ver')
export class ReportsController {
  constructor(
    private readonly repo: ReportsRepository,
    private readonly settings: SettingsService,
  ) {}

  @Get('km')
  async km(@ClientId() clientId: string, @Query() query: AssetPeriodQueryDto) {
    const { assetId, from, to } = this.parsePeriod(query);

    const row = await this.repo.kmPorAtivo(clientId, assetId, from, to);
    if (!row) {
      return { assetId, desde: null, ate: null, distanciaKm: null, amostras: 0 };
    }
    return {
      assetId: row.asset_id,
      desde: row.desde,
      ate: row.ate,
      // odometer_m fica em metros no banco de propósito (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.2);
      // a conversão para km é só na apresentação.
      distanciaKm: row.distancia_m === null ? null : row.distancia_m / 1000,
      amostras: row.amostras,
    };
  }

  @Get('excesso-velocidade')
  async excessoVelocidade(@ClientId() clientId: string, @Query() query: AssetPeriodQueryDto) {
    const { assetId, from, to } = this.parsePeriod(query);
    const [limiteKmh, duracaoMinSegundos] = await Promise.all([
      this.settings.resolve(clientId, 'monitoramento.velocidade_limite_kmh'),
      this.settings.resolve(clientId, 'monitoramento.excesso_episodio_min_s'),
    ]);

    const episodios = await this.repo.excessosPorAtivo(clientId, assetId, from, to, limiteKmh, duracaoMinSegundos);
    return {
      assetId,
      limiteKmh,
      episodios: episodios.map((e) => ({
        inicio: e.inicio,
        fim: e.fim,
        duracaoS: Math.round((e.fim.getTime() - e.inicio.getTime()) / 1000),
        velocidadeMaxKmh: e.velocidade_max,
        amostras: e.amostras,
      })),
    };
  }

  @Get('paradas')
  async paradas(@ClientId() clientId: string, @Query() query: AssetPeriodQueryDto) {
    const { assetId, from, to } = this.parsePeriod(query);
    const duracaoMinMinutos = await this.settings.resolve(clientId, 'monitoramento.parada_min_duracao_min');

    const episodios = await this.repo.paradasPorAtivo(clientId, assetId, from, to, duracaoMinMinutos);
    return {
      assetId,
      episodios: episodios.map((e) => ({
        inicio: e.inicio,
        fim: e.fim,
        duracaoMin: Math.round(((e.fim.getTime() - e.inicio.getTime()) / 60000) * 10) / 10,
        amostras: e.amostras,
      })),
    };
  }

  private parsePeriod(query: AssetPeriodQueryDto): { assetId: string; from: Date; to: Date } {
    if (!query.assetId) throw new BadRequestException('Parâmetro "assetId" é obrigatório');
    const from = parseDate('from', query.from);
    const to = parseDate('to', query.to);
    if (from > to) throw new BadRequestException('"from" não pode ser depois de "to"');
    return { assetId: query.assetId, from, to };
  }
}
