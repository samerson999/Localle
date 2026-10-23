import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { CurrentUserId } from '../clients/current-role.decorator';
import { CreateRastreadorDto } from './dto/create-rastreador.dto';
import { CreateSimCardDto } from './dto/create-sim-card.dto';
import { InstalarRastreadorDto } from './dto/instalar-rastreador.dto';
import { RastreadoresRepository } from './rastreadores.repository';
import { RastreadoresService } from './rastreadores.service';
import { SimCardsRepository } from './sim-cards.repository';

/**
 * Cadastro/vínculo de rastreadores e chips é inventário da Locale (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md
 * § 4.1) — rota exclusiva de superadmin, nunca do gestor de frota do cliente. Instalar/desinstalar afeta
 * um cliente específico, sempre com `clientId` explícito no path (mesmo requisito de `SuperadminController`).
 */
@Controller('superadmin/rastreadores')
@UseGuards(SuperadminGuard)
export class RastreadoresController {
  constructor(
    private readonly service: RastreadoresService,
    private readonly rastreadores: RastreadoresRepository,
    private readonly simCards: SimCardsRepository,
  ) {}

  @Get()
  findAll() {
    return this.rastreadores.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const rastreador = await this.rastreadores.findById(id);
    if (!rastreador) throw new NotFoundException('Rastreador não encontrado');
    return rastreador;
  }

  @Get(':id/instalacoes')
  historico(@Param('id') id: string) {
    return this.service.historicoInstalacoes(id);
  }

  @Post()
  create(@CurrentUserId() superadminId: string, @Body() dto: CreateRastreadorDto) {
    return this.service.cadastrarRastreador(superadminId, dto);
  }

  @Post(':id/instalar/:clientId')
  instalar(
    @CurrentUserId() superadminId: string,
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Body() dto: InstalarRastreadorDto,
  ) {
    return this.service.instalar(superadminId, clientId, id, {
      assetId: dto.assetId,
      tecnico: dto.tecnico,
      papel: dto.papel,
      instaladoEm: dto.instaladoEm ? new Date(dto.instaladoEm) : undefined,
      kmInicial: dto.kmInicial,
      foto: dto.foto,
    });
  }

  @Post('instalacoes/:instalacaoId/desinstalar')
  desinstalar(@CurrentUserId() superadminId: string, @Param('instalacaoId') instalacaoId: string) {
    return this.service.desinstalar(superadminId, instalacaoId);
  }

  @Post('sim-cards')
  createSimCard(@CurrentUserId() superadminId: string, @Body() dto: CreateSimCardDto) {
    return this.service.cadastrarSimCard(superadminId, dto);
  }

  @Get('sim-cards/all')
  findAllSimCards() {
    return this.simCards.findAll();
  }

  @Post('sim-cards/:simCardId/vincular/:rastreadorId')
  vincularSimCard(
    @CurrentUserId() superadminId: string,
    @Param('simCardId') simCardId: string,
    @Param('rastreadorId') rastreadorId: string,
  ) {
    return this.service.vincularSimCard(superadminId, simCardId, rastreadorId);
  }

  @Post('sim-cards/:simCardId/desvincular')
  desvincularSimCard(@CurrentUserId() superadminId: string, @Param('simCardId') simCardId: string) {
    return this.service.desvincularSimCard(superadminId, simCardId);
  }
}
