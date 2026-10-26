import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { booleano, erro, instante, instanteOpcional, listaUuids, numero, numeroOpcional, opcao, texto, textoOpcional, uuid, uuidOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { GATILHOS, ManutencaoRepository, type OsInput, type OsRow, type PlanoInput, STATUS_OS, TIPOS_OS } from './manutencao.repository';
import { ManutencaoService } from './manutencao.service';

export function parsePlano(body: unknown): PlanoInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const gatilho = opcao(b.gatilho, 'gatilho', GATILHOS);
  const p: PlanoInput = {
    nome: texto(b.nome, 'nome', 120),
    servico: texto(b.servico, 'servico', 40),
    itens: textoOpcional(b.itens, 'itens', 500) ?? '',
    gatilho,
    kmIntervalo: numeroOpcional(b.kmIntervalo, 'kmIntervalo', 0, 1_000_000, true) ?? 0,
    diasIntervalo: numeroOpcional(b.diasIntervalo, 'diasIntervalo', 0, 3650, true) ?? 0,
    antecedenciaKm: numeroOpcional(b.antecedenciaKm, 'antecedenciaKm', 0, 100_000, true) ?? 0,
    antecedenciaDias: numeroOpcional(b.antecedenciaDias, 'antecedenciaDias', 0, 365, true) ?? 0,
    criticoDias: numeroOpcional(b.criticoDias, 'criticoDias', 1, 90, true),
    criticoKm: numeroOpcional(b.criticoKm, 'criticoKm', 100, 50_000, true),
    ativo: booleano(b.ativo, 'ativo', true),
    assetIds: listaUuids(b.assetIds, 'assetIds'),
  };
  if (gatilho !== 'tempo' && p.kmIntervalo <= 0) erro('"kmIntervalo" é obrigatório para gatilho por km');
  if (gatilho !== 'km' && p.diasIntervalo <= 0) erro('"diasIntervalo" é obrigatório para gatilho por tempo');
  return p;
}

export function parseOs(body: unknown): OsInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const status = opcao(b.status, 'status', STATUS_OS, 'aberta');
  const liberadaEm = instanteOpcional(b.liberadaEm, 'liberadaEm');
  if (status === 'concluida' && !liberadaEm) erro('"liberadaEm" é obrigatório para concluir a OS');
  const servicos = Array.isArray(b.servicos) ? b.servicos : [];
  if (servicos.length > 20 || servicos.some((s) => typeof s !== 'string' || s.length === 0 || s.length > 40)) erro('"servicos" precisa ser uma lista de até 20 códigos');
  return {
    assetId: uuid(b.assetId, 'assetId'),
    planoId: uuidOpcional(b.planoId, 'planoId'),
    tipo: opcao(b.tipo, 'tipo', TIPOS_OS),
    titulo: texto(b.titulo, 'titulo', 160),
    descricao: textoOpcional(b.descricao, 'descricao', 2000),
    servicos: servicos as string[],
    status,
    naoPlanejada: booleano(b.naoPlanejada, 'naoPlanejada'),
    abertaEm: b.abertaEm === undefined ? new Date() : instante(b.abertaEm, 'abertaEm'),
    entradaOficinaEm: instanteOpcional(b.entradaOficinaEm, 'entradaOficinaEm'),
    liberadaEm,
    odometro: numeroOpcional(b.odometro, 'odometro', 0, 10_000_000),
    custo: numero(b.custo ?? 0, 'custo', 0, 100_000_000),
    fornecedor: textoOpcional(b.fornecedor, 'fornecedor', 120),
    dados: typeof b.dados === 'object' && b.dados !== null && !Array.isArray(b.dados) ? (b.dados as Record<string, unknown>) : {},
  };
}

function tratarOs(r: OsRow | null | 'ativo_invalido' | 'plano_invalido'): OsRow {
  if (r === 'ativo_invalido') throw new BadRequestException('Ativo não encontrado');
  if (r === 'plano_invalido') throw new BadRequestException('Plano não encontrado');
  if (!r) throw new NotFoundException('OS não encontrada');
  return r;
}

@Controller('manutencao')
@UseGuards(PermissionsGuard)
export class ManutencaoController {
  constructor(
    private readonly repo: ManutencaoRepository,
    private readonly service: ManutencaoService,
  ) {}

  @Get('planos')
  listarPlanos(@ClientId() clientId: string) {
    return this.repo.listarPlanos(clientId);
  }

  /** Status plano × ativo (em dia / próxima / vencida / OS aberta, com nível crítico). */
  @Get('status')
  status(@ClientId() clientId: string) {
    return this.service.statusGeral(clientId);
  }

  @Post('planos')
  @RequirePermission('manutencao.editar')
  criarPlano(@ClientId() clientId: string, @Body() body: unknown) {
    return this.repo.salvarPlano(clientId, parsePlano(body), null);
  }

  @Put('planos/:id')
  @RequirePermission('manutencao.editar')
  async atualizarPlano(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = await this.repo.salvarPlano(clientId, parsePlano(body), id);
    if (!p) throw new NotFoundException('Plano não encontrado');
    return p;
  }

  @Delete('planos/:id')
  @RequirePermission('manutencao.editar')
  @HttpCode(204)
  async removerPlano(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.removerPlano(clientId, id))) throw new NotFoundException('Plano não encontrado');
  }

  @Get('os')
  listarOs(@ClientId() clientId: string, @Query('assetId') assetId?: string, @Query('abertas') abertas?: string) {
    return this.repo.listarOs(clientId, uuidOpcional(assetId, 'assetId'), abertas === 'true');
  }

  @Get('os/:id')
  async buscarOs(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    return tratarOs(await this.repo.buscarOs(clientId, id));
  }

  @Post('os')
  @RequirePermission('manutencao.editar')
  async criarOs(@ClientId() clientId: string, @Body() body: unknown) {
    return tratarOs(await this.repo.salvarOs(clientId, parseOs(body), null));
  }

  @Put('os/:id')
  @RequirePermission('manutencao.editar')
  async atualizarOs(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return tratarOs(await this.repo.salvarOs(clientId, parseOs(body), id));
  }
}
