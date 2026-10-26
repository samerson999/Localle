import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { dataOpcional, dicionario, erro, instante, numero, numeroOpcional, periodo, texto, textoOpcional, uuid, uuidOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { type AbastecimentoInput, type AbastecimentoRow, AbastecimentosRepository, type NotaFiscal } from './abastecimentos.repository';
import { CombustivelService } from './combustivel.service';

function parseNota(v: unknown): NotaFiscal | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) erro('"nf" precisa ser um objeto');
  const n = v as Record<string, unknown>;
  return {
    litros: numeroOpcional(n.litros, 'nf.litros', 0, 100_000),
    total: numeroOpcional(n.total, 'nf.total', 0, 10_000_000),
    data: dataOpcional(n.data, 'nf.data'),
    cnpj: textoOpcional(n.cnpj, 'nf.cnpj', 20),
    chave: textoOpcional(n.chave, 'nf.chave', 60),
  };
}

export function parseAbastecimento(body: unknown): AbastecimentoInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const ts = instante(b.ts, 'ts');
  if (ts.getTime() > Date.now() + 3600_000) erro('"ts" não pode estar no futuro');
  return {
    assetId: uuid(b.assetId, 'assetId'),
    motoristaId: uuidOpcional(b.motoristaId, 'motoristaId'),
    ts,
    odometro: numero(b.odometro, 'odometro', 0, 10_000_000),
    litros: numero(b.litros, 'litros', 0.01, 100_000),
    total: numero(b.total, 'total', 0, 10_000_000),
    precoLitro: numeroOpcional(b.precoLitro, 'precoLitro', 0, 1000),
    combustivel: texto(b.combustivel, 'combustivel', 40),
    posto: textoOpcional(b.posto, 'posto', 120),
    postoCnpj: textoOpcional(b.postoCnpj, 'postoCnpj', 20),
    kmRastreador: numeroOpcional(b.kmRastreador, 'kmRastreador', 0, 10_000_000),
    nf: parseNota(b.nf),
    dados: dicionario(b.dados, 'dados'),
  };
}

function tratar(r: AbastecimentoRow | null | 'ativo_invalido' | 'motorista_invalido'): AbastecimentoRow {
  if (r === 'ativo_invalido') throw new BadRequestException('Ativo não encontrado');
  if (r === 'motorista_invalido') throw new BadRequestException('Motorista não encontrado');
  if (!r) throw new NotFoundException('Abastecimento não encontrado');
  return r;
}

@Controller('abastecimentos')
@UseGuards(PermissionsGuard)
export class CombustivelController {
  constructor(
    private readonly repo: AbastecimentosRepository,
    private readonly service: CombustivelService,
  ) {}

  @Get()
  listar(@ClientId() clientId: string, @Query('de') de?: string, @Query('ate') ate?: string, @Query('assetId') assetId?: string) {
    const [inicio, fim] = periodo(de, ate, 90, 2 * 366);
    return this.service.listar(clientId, inicio, fim, uuidOpcional(assetId, 'assetId'));
  }

  @Post()
  @RequirePermission('combustivel.editar')
  async criar(@ClientId() clientId: string, @Body() body: unknown) {
    return tratar(await this.repo.criar(clientId, parseAbastecimento(body)));
  }

  @Put(':id')
  @RequirePermission('combustivel.editar')
  async atualizar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return tratar(await this.repo.atualizar(clientId, id, parseAbastecimento(body)));
  }

  @Delete(':id')
  @RequirePermission('combustivel.editar')
  @HttpCode(204)
  async remover(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.delete(clientId, id))) throw new NotFoundException('Abastecimento não encontrado');
  }
}
