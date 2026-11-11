import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { parseDate } from '../common/parse-date';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { SettingsService } from '../settings/settings.service';
import { lerTelemetriaComIdade, mapeamentoDaLinha } from '../telemetria/leitura';
import { comunicacaoDaLinha } from './comunicacao-status';
import type { EventosQueryDto } from './dto/eventos-query.dto';
import type { HistoryQueryDto } from './dto/history-query.dto';
import { MonitoringRepository } from './monitoring.repository';

// Limita o custo da consulta (o `limit` só corta a resposta, não o scan em `eventos`/`posicoes`).
const PERIODO_MAX_DIAS = 93;
// Resumo de uso da Home: hoje + 7 dias anteriores, no fuso da operação (mesmo do faturamento, contratos.repository).
const RESUMO_DIAS = 7;
const FUSO_OPERACAO = 'America/Recife';

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
      this.settings.resolveMenorPorAtivo(clientId, 'monitoramento.sem_sinal_h'),
    ]);
    const agora = new Date();
    return rows.map((r) => ({
      assetId: r.asset_id,
      plate: r.plate,
      rotulo: r.rotulo,
      icone: r.icone,
      // null = aguardando primeira posição (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.4), não erro.
      fixTime: r.fix_time,
      longitude: r.longitude,
      latitude: r.latitude,
      speedKmh: r.speed_kmh,
      ignition: r.ignition,
      rastreadorId: r.rastreador_id,
      instalacaoId: r.instalacao_id,
      imei: r.imei,
      modelo: r.modelo,
      instaladoEm: r.instalado_em,
      ultimoPacoteEm: r.ultimo_pacote_em,
      comunicacao: comunicacaoDaLinha(r, semSinalH(r.asset_id), agora),
      telemetria: lerTelemetriaComIdade(r.ultimos_atributos, r.atributos_vistos_em, mapeamentoDaLinha(r)),
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
      rotulo: r.rotulo,
      tipo: r.tipo,
      origem: r.origem,
      ts: r.ts,
      longitude: r.longitude,
      latitude: r.latitude,
      speedKmh: r.speed_kmh,
      attributes: r.attributes,
    }));
  }

  /**
   * Uso da frota por ativo e por dia (km e minutos em movimento) de hoje e dos 7 dias anteriores — base da Home do gestor
   * (atividade de hoje, utilização por dia, uso por grupo). `dias` lista os 8 dias em ordem, inclusive os sem uso.
   */
  @Get('resumo-uso')
  async resumoUso(@ClientId() clientId: string) {
    const agora = new Date();
    const rows = await this.repo.usoDiario(clientId, agora, RESUMO_DIAS, FUSO_OPERACAO);
    return {
      fuso: FUSO_OPERACAO,
      dias: diasAte(agora, RESUMO_DIAS, FUSO_OPERACAO),
      uso: rows.map((r) => ({ assetId: r.asset_id, dia: r.dia, km: Math.round(r.dist_m / 100) / 10, minutosMovimento: r.minutos_mov })),
    };
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

/** Os `dias` dias anteriores a `agora` e o próprio dia, `YYYY-MM-DD` no fuso, do mais antigo ao mais recente. */
export function diasAte(agora: Date, dias: number, fuso: string): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' });
  const hoje = fmt.format(agora);
  const base = Date.parse(`${hoje}T12:00:00Z`); // meio-dia: somar dias inteiros não cruza a data por fuso
  return Array.from({ length: dias + 1 }, (_, i) => new Date(base - (dias - i) * 86_400_000).toISOString().slice(0, 10));
}
