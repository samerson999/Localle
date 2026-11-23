import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { parseDate } from '../common/parse-date';
import { parseUuid } from '../common/parse-uuid';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import type { InstalarRastreadorDto } from './dto/instalar-rastreador.dto';
import { RastreadorVinculosRepository } from './rastreador-vinculos.repository';
import { RastreadoresService } from './rastreadores.service';

/**
 * Lado do cliente: vê só os rastreadores que a Locale vinculou a ele e escolhe em qual ativo cada um está.
 * `clientId` sempre do JWT (`@ClientId()`), nunca do corpo — rastreador ou instalação de outro cliente
 * responde 404 (o service confere o vínculo dentro da transação).
 */
@Controller('rastreadores')
@UseGuards(PermissionsGuard)
export class RastreadoresClienteController {
  constructor(
    private readonly service: RastreadoresService,
    private readonly vinculos: RastreadorVinculosRepository,
  ) {}

  @Get()
  @RequirePermission('ativos.ver')
  findAll(@ClientId() clientId: string) {
    return this.vinculos.doCliente(clientId);
  }

  /** Última posição do backup do ativo, no card do Monitoramento (quem vê o mapa vê o backup; não exige `ativos.ver`). */
  @Get('ativos/:assetId/backup')
  @RequirePermission('monitoramento.ver')
  async backupDoAtivo(@ClientId() clientId: string, @Param('assetId', ParseUUIDPipe) assetId: string) {
    // embrulhado: `null` puro sai como corpo vazio e o front não consegue ler como JSON
    return { backup: await this.vinculos.backupDoAtivo(clientId, assetId) };
  }

  @Post(':id/instalar')
  @RequirePermission('ativos.editar')
  instalar(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InstalarRastreadorDto,
  ) {
    return this.service.instalar({ type: 'user', id: userId }, clientId, id, parseInstalar(dto));
  }

  @Post('ativos/:assetId/trocar-principal')
  @RequirePermission('ativos.editar')
  trocarPrincipal(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.service.trocarPrincipal({ type: 'user', id: userId }, clientId, assetId);
  }

  /** Leitor de cartão do motorista instalado junto (liga o aviso de "rodando sem identificação" para o veículo). */
  @Post('instalacoes/:instalacaoId/leitor-motorista')
  @RequirePermission('ativos.editar')
  leitorMotorista(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @Param('instalacaoId', ParseUUIDPipe) instalacaoId: string,
    @Body() body: unknown,
  ) {
    const instalado = (body as { instalado?: unknown } | null)?.instalado;
    if (typeof instalado !== 'boolean') throw new BadRequestException('"instalado" precisa ser true ou false');
    return this.service.definirLeitorMotorista({ type: 'user', id: userId }, clientId, instalacaoId, instalado);
  }

  @Post('instalacoes/:instalacaoId/desinstalar')
  @RequirePermission('ativos.editar')
  desinstalar(
    @ClientId() clientId: string,
    @CurrentUserId() userId: string,
    @Param('instalacaoId', ParseUUIDPipe) instalacaoId: string,
  ) {
    return this.service.desinstalar({ type: 'user', id: userId }, instalacaoId, clientId);
  }
}

/** Sem class-validator no projeto: validação explícita antes do service. */
export function parseInstalar(body: unknown) {
  const dto = (body ?? {}) as Record<string, unknown>;
  const tecnico = typeof dto.tecnico === 'string' ? dto.tecnico.trim() : '';
  if (!tecnico || tecnico.length > 120) throw new BadRequestException('"tecnico" precisa ser texto de 1 a 120 caracteres');
  let kmInicial: string | undefined;
  if (dto.kmInicial !== undefined && dto.kmInicial !== null && dto.kmInicial !== '') {
    const km = Number(dto.kmInicial);
    if (!Number.isFinite(km) || km < 0 || km > 99_999_999) throw new BadRequestException('"kmInicial" precisa ser um número de km válido');
    kmInicial = String(km);
  }
  // o cliente escolhe entre principal e backup; o papel `can` não é exposto aqui
  if (dto.leitorMotorista !== undefined && typeof dto.leitorMotorista !== 'boolean') throw new BadRequestException('"leitorMotorista" precisa ser true ou false');
  if (dto.papel !== undefined && dto.papel !== 'principal' && dto.papel !== 'backup') {
    throw new BadRequestException('"papel" precisa ser principal ou backup');
  }
  return {
    assetId: parseUuid('assetId', dto.assetId),
    papel: dto.papel as 'principal' | 'backup' | undefined,
    tecnico,
    instaladoEm: dto.instaladoEm ? parseDate('instaladoEm', dto.instaladoEm) : undefined,
    kmInicial,
    leitorMotorista: dto.leitorMotorista === true,
  };
}
