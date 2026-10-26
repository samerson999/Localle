import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { instante, opcao, periodo, uuid, uuidOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { JornadaRepository, ORIGENS, TIPOS_MARCACAO } from './jornada.repository';
import { JornadaService } from './jornada.service';

@Controller('jornada')
@UseGuards(PermissionsGuard)
export class JornadaController {
  constructor(
    private readonly repo: JornadaRepository,
    private readonly service: JornadaService,
  ) {}

  /** Sem `motoristaId`, todas as marcações do cliente no período (carga inicial do front). */
  @Get('marcacoes')
  listar(@ClientId() clientId: string, @Query('motoristaId') motoristaId?: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    const [inicio, fim] = periodo(de, ate);
    return this.repo.listar(clientId, uuidOpcional(motoristaId, 'motoristaId'), inicio, fim);
  }

  @Get('espelho')
  espelho(@ClientId() clientId: string, @Query('motoristaId') motoristaId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    const [inicio, fim] = periodo(de, ate);
    return this.service.espelho(clientId, uuid(motoristaId, 'motoristaId'), inicio, fim);
  }

  @Post('marcacoes')
  @RequirePermission('jornada.editar')
  async criar(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: Record<string, unknown>) {
    const b = body ?? {};
    try {
      const m = await this.repo.criar(clientId, {
        motoristaId: uuid(b.motoristaId, 'motoristaId'),
        assetId: uuidOpcional(b.assetId, 'assetId'),
        ts: instante(b.ts, 'ts'),
        tipo: opcao(b.tipo, 'tipo', TIPOS_MARCACAO),
        origem: opcao(b.origem, 'origem', ORIGENS, 'manual'),
        criadoPor: userId,
      });
      if (!m) throw new NotFoundException('Motorista não encontrado');
      return m;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictException('Já existe essa marcação nesse instante');
      throw err;
    }
  }

  @Delete('marcacoes/:id')
  @RequirePermission('jornada.editar')
  @HttpCode(204)
  async remover(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.delete(clientId, id))) throw new NotFoundException('Marcação não encontrada');
  }
}
