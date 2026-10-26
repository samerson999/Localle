import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { parseUuid } from '../common/parse-uuid';
import { CurrentUserId } from '../clients/current-role.decorator';
import { ContratosRepository } from './contratos.repository';
import { ContratosService } from './contratos.service';
import { parseCompetencia, parseContrato, parseData } from './dto/parse-contrato';
import { FaturamentoService, hojeLocal } from './faturamento.service';
import { FaturasRepository } from './faturas.repository';

/** Console da Locale · Contratos e Faturamento. Só superadmin; `clientId`/ids sempre explícitos no path. */
@Controller('superadmin')
@UseGuards(SuperadminGuard)
export class ContratosController {
  constructor(
    private readonly repo: ContratosRepository,
    private readonly service: ContratosService,
    private readonly faturamento: FaturamentoService,
    private readonly faturas: FaturasRepository,
  ) {}

  @Get('contratos')
  findAll() {
    return this.repo.findAll();
  }

  @Get('contratos/:id/versoes')
  async versoes(@Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.findById(id))) throw new NotFoundException('Contrato não encontrado');
    return this.repo.findVersoes(id);
  }

  @Post('clients/:clientId/contrato')
  criar(@CurrentUserId() superadminId: string, @Param('clientId', ParseUUIDPipe) clientId: string, @Body() body: unknown) {
    return this.service.criar(superadminId, clientId, parseContrato(body));
  }

  @Put('contratos/:id')
  atualizar(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.service.atualizar(superadminId, id, parseContrato(body));
  }

  @Get('faturamento')
  apuracao(@Query('competencia') competencia?: string) {
    return this.faturamento.apuracao(competencia ? parseCompetencia(competencia) : hojeLocal().slice(0, 7));
  }

  @Post('faturamento/:competencia/fechar')
  fechar(@CurrentUserId() superadminId: string, @Param('competencia') competencia: string, @Query('clientId') clientId?: string) {
    return this.faturamento.fechar(superadminId, parseCompetencia(competencia), {
      clientId: clientId === undefined ? undefined : parseUuid('clientId', clientId),
    });
  }

  @Get('faturas/:id/pagamentos')
  async pagamentos(@Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.faturas.findById(id))) throw new NotFoundException('Fatura não encontrada');
    return this.faturas.findPagamentos(id);
  }

  @Post('faturas/:id/pagamentos')
  registrarPagamento(@CurrentUserId() superadminId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const o = (body ?? {}) as Record<string, unknown>;
    const observacao = typeof o.observacao === 'string' && o.observacao.trim() ? o.observacao.trim().slice(0, 500) : null;
    return this.faturamento.registrarPagamento(superadminId, id, {
      valor: typeof o.valor === 'number' ? o.valor : NaN,
      pagoEm: parseData('pagoEm', o.pagoEm),
      forma: String(o.forma ?? ''),
      observacao,
    });
  }
}
