import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { parseDate } from '../common/parse-date';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { SettingsService } from '../settings/settings.service';
import { statusComunicacao } from './comunicacao-status';
import type { EventosQueryDto } from './dto/eventos-query.dto';
import type { HistoryQueryDto } from './dto/history-query.dto';
import { MonitoringRepository } from './monitoring.repository';

// Limita o custo da consulta (o `limit` só corta a resposta, não o scan em `eventos`/`posicoes`).
const PERIODO_MAX_DIAS = 93;

@Controller('monitoring')
@UseGuards(PermissionsGuard)
@RequirePermission('monitoramento.ver')
export class MonitoringController {
  constructor(
    private readonly repo: MonitoringRepository,
    private readonly settings: SettingsService,
  ) {}

  @Get('current')
  async current(@ClientId() clientId: string) {
    const [rows, semSinalH] = await Promise.all([
      this.repo.frotaAtual(clientId),
      this.settings.resolve(clientId, 'monitoramento.sem_sinal_h'),
    ]);
    const agora = new Date();
    return rows.map((r) => ({
      assetId: r.asset_id,
      plate: r.plate,
      // null = aguardando primeira posição (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.4), não erro.
      fixTime: r.fix_time,
      longitude: r.longitude,
      latitude: r.latitude,
      speedKmh: r.speed_kmh,
      ignition: r.ignition,
      rastreadorId: r.rastreador_id,
      ultimoPacoteEm: r.ultimo_pacote_em,
      comunicacao: statusComunicacao(
        {
          temRastreador: r.rastreador_id !== null,
          ultimoPacoteEm: r.ultimo_pacote_em,
          ultimaPosicaoValidaEm: r.ultima_posicao_valida_em,
        },
        semSinalH,
        agora,
      ),
    }));
  }

  @Get('events')
  async events(@ClientId() clientId: string, @Query() query: EventosQueryDto) {
    const { from, to } = this.periodo(query);
    let assetId: string | null = null;
    if (query.assetId !== undefined) {
      assetId = await new ParseUUIDPipe().transform(query.assetId, { type: 'query', data: 'assetId' });
    }
    const rows = await this.repo.eventos(clientId, from, to, assetId);
    return rows.map((r) => ({
      id: r.id,
      assetId: r.asset_id,
      plate: r.plate,
      tipo: r.tipo,
      origem: r.origem,
      ts: r.ts,
      longitude: r.longitude,
      latitude: r.latitude,
      speedKmh: r.speed_kmh,
      attributes: r.attributes,
    }));
  }

  @Get('assets/:assetId/history')
  async history(@ClientId() clientId: string, @Param('assetId', ParseUUIDPipe) assetId: string, @Query() query: HistoryQueryDto) {
    const { from, to } = this.periodo(query);
    const rows = await this.repo.historicoDoAtivo(clientId, assetId, from, to);
    return rows.map((r) => ({
      fixTime: r.fix_time,
      longitude: r.longitude,
      latitude: r.latitude,
      speedKmh: r.speed_kmh,
      course: r.course,
      ignition: r.ignition,
      valid: r.valid,
    }));
  }

  private periodo(query: { from: string; to: string }) {
    const from = parseDate('from', query.from);
    const to = parseDate('to', query.to);
    if (from > to) throw new BadRequestException('"from" não pode ser depois de "to"');
    if (to.getTime() - from.getTime() > PERIODO_MAX_DIAS * 86_400_000) {
      throw new BadRequestException(`Período máximo de ${PERIODO_MAX_DIAS} dias`);
    }
    return { from, to };
  }
}
