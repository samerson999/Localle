import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { CurrentUserId } from '../clients/current-role.decorator';
import { CreateRastreadorDto } from './dto/create-rastreador.dto';
import { parseCreateSimCard } from './dto/create-sim-card.dto';
import { parseUpdateRastreador, type UpdateRastreadorDto } from './dto/update-rastreador.dto';
import { RastreadoresRepository } from './rastreadores.repository';
import { RastreadoresService } from './rastreadores.service';
import { RastreadorModelosService } from './rastreador-modelos.service';
import { SimCardsRepository } from './sim-cards.repository';

/**
 * Cadastro/vínculo de rastreadores e chips é inventário da Locale (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md
 * § 4.1) — rota exclusiva de superadmin. Vincular a um cliente leva `clientId` explícito no path (mesmo
 * requisito de `SuperadminController`); instalar no ativo é do próprio cliente (rastreadores-cliente.controller).
 */
@Controller('superadmin/rastreadores')
@UseGuards(SuperadminGuard)
export class RastreadoresController {
  constructor(
    private readonly service: RastreadoresService,
    private readonly rastreadores: RastreadoresRepository,
    private readonly simCards: SimCardsRepository,
    private readonly modelos: RastreadorModelosService,
  ) {}

  @Get()
  findAll() {
    return this.rastreadores.findAllPainel();
  }

  /** Aba Transmissão: o que cada rastreador não desativado está mandando (antes de `:id`, que exige UUID). */
  @Get('transmissao')
  transmissao() {
    return this.modelos.transmissao();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const rastreador = await this.rastreadores.findById(id);
    if (!rastreador) throw new NotFoundException('Rastreador não encontrado');
    return rastreador;
  }

  /** Checklist do rastreador: modelo, Traccar (protocolo/porta, conexão, comandos) e telemetria recebida. */
  @Get(':id/diagnostico')
  diagnostico(@Param('id', ParseUUIDPipe) id: string) {
    return this.modelos.diagnostico(id);
  }

  @Get(':id/instalacoes')
  historico(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.historicoInstalacoes(id);
  }

  @Post()
  create(@CurrentUserId() superadminId: string, @Body() dto: CreateRastreadorDto) {
    return this.service.cadastrarRastreador(superadminId, dto);
  }

  @Patch(':id')
  atualizar(
    @CurrentUserId() superadminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRastreadorDto,
  ) {
    return this.service.atualizar(superadminId, id, parseUpdateRastreador(dto));
  }

  /** Cadastro errado: em estoque ou desativado; apaga o histórico junto. Instalado ou com cliente: recusa. */
  @Delete(':id')
  @HttpCode(204)
  async excluir(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.excluir(superadminId, id);
  }

  @Post(':id/desativar')
  desativar(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.desativar(superadminId, id);
  }

  /** Rastreador passa a ser do cliente; quem escolhe o ativo é o próprio cliente (rastreadores-cliente.controller). */
  @Post(':id/vincular/:clientId')
  vincular(
    @CurrentUserId() superadminId: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.vincular(superadminId, clientId, id);
  }

  @Post(':id/desvincular')
  desvincular(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.desvincular(superadminId, id);
  }

  @Post('instalacoes/:instalacaoId/desinstalar')
  desinstalar(@CurrentUserId() superadminId: string, @Param('instalacaoId', ParseUUIDPipe) instalacaoId: string) {
    return this.service.desinstalar({ type: 'superadmin', id: superadminId }, instalacaoId);
  }

  @Post('sim-cards')
  createSimCard(@CurrentUserId() superadminId: string, @Body() body: unknown) {
    return this.service.cadastrarSimCard(superadminId, parseCreateSimCard(body));
  }

  @Get('sim-cards/all')
  findAllSimCards() {
    return this.simCards.findAll();
  }

  @Post('sim-cards/:simCardId/vincular/:rastreadorId')
  vincularSimCard(
    @CurrentUserId() superadminId: string,
    @Param('simCardId', ParseUUIDPipe) simCardId: string,
    @Param('rastreadorId', ParseUUIDPipe) rastreadorId: string,
  ) {
    return this.service.vincularSimCard(superadminId, simCardId, rastreadorId);
  }

  @Post('sim-cards/:simCardId/desvincular')
  desvincularSimCard(@CurrentUserId() superadminId: string, @Param('simCardId', ParseUUIDPipe) simCardId: string) {
    return this.service.desvincularSimCard(superadminId, simCardId);
  }
}
