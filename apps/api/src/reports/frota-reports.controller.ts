import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { parseDate } from '../common/parse-date';
import { parseUuid } from '../common/parse-uuid';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { FrotaReportsService, type Periodo } from './frota-reports.service';

/** Relatório de frota percorre posição a posição de cada ativo: período limitado para o custo ser previsível. */
const PERIODO_MAX_DIAS = 31;
const MAX_ATIVOS = 1000;

interface FrotaQuery {
  from?: string;
  to?: string;
  /** Lista separada por vírgula; ausente = todos os ativos do cliente. */
  assetIds?: string;
}

@Controller('reports')
@UseGuards(PermissionsGuard)
@RequirePermission('relatorios.ver')
export class FrotaReportsController {
  constructor(private readonly service: FrotaReportsService) {}

  @Get('velocidade')
  velocidade(@ClientId() clientId: string, @Query() q: FrotaQuery & { minSpeed?: string }) {
    const min = q.minSpeed === undefined ? 0 : Number(q.minSpeed);
    if (!Number.isFinite(min) || min < 0 || min > 300) throw new BadRequestException('"minSpeed" precisa estar entre 0 e 300');
    return this.service.velocidade(clientId, ativos(q.assetIds), periodo(q), min);
  }

  /** Resumo do percurso (distância, em movimento, motor ligado, ocioso, paradas): Posições e Motor. */
  @Get('percurso')
  percurso(@ClientId() clientId: string, @Query() q: FrotaQuery) {
    return this.service.percurso(clientId, ativos(q.assetIds), periodo(q));
  }

  @Get('cercas')
  cercas(@ClientId() clientId: string, @Query() q: FrotaQuery & { cercaId?: string }) {
    const cercaId = q.cercaId ? parseUuid('cercaId', q.cercaId) : null;
    return this.service.cercas(clientId, ativos(q.assetIds), periodo(q), cercaId);
  }

  @Get('passou-por-aqui')
  passouPorAqui(@ClientId() clientId: string, @Query() q: FrotaQuery & { lat?: string; lon?: string; raio?: string }) {
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    const raio = Number(q.raio);
    if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) throw new BadRequestException('"lat"/"lon" inválidos');
    if (!(raio >= 10 && raio <= 50_000)) throw new BadRequestException('"raio" precisa estar entre 10 e 50000 metros');
    return this.service.passouPorAqui(clientId, ativos(q.assetIds), periodo(q), [lat, lon], raio);
  }
}

function periodo(q: FrotaQuery): Periodo {
  const from = parseDate('from', q.from);
  const to = parseDate('to', q.to);
  if (from > to) throw new BadRequestException('"from" não pode ser depois de "to"');
  if (to.getTime() - from.getTime() > PERIODO_MAX_DIAS * 86_400_000) {
    throw new BadRequestException(`Período máximo de ${PERIODO_MAX_DIAS} dias`);
  }
  return { from, to };
}

function ativos(raw: string | undefined): string[] | null {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') throw new BadRequestException('"assetIds" precisa ser uma lista separada por vírgula');
  const ids = raw.split(',').map((s, i) => parseUuid(`assetIds[${i}]`, s.trim()));
  if (ids.length > MAX_ATIVOS) throw new BadRequestException(`No máximo ${MAX_ATIVOS} ativos por relatório`);
  return ids;
}
