import { Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import { CurrentUserId } from '../clients/current-role.decorator';
import { dicionario, instante, numero, numeroOpcional, opcao, texto, textoOpcional, uuidOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { type MovimentoInput, type PneuInput, PneusRepository, STATUS_PNEU, TIPOS_MOVIMENTO } from './pneus.repository';
import { PneusService } from './pneus.service';

export function parsePneu(body: unknown): PneuInput {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    numeroFogo: texto(b.numeroFogo, 'numeroFogo', 40),
    marca: textoOpcional(b.marca, 'marca', 60),
    modelo: textoOpcional(b.modelo, 'modelo', 60),
    medida: textoOpcional(b.medida, 'medida', 30),
    vidasMax: numeroOpcional(b.vidasMax, 'vidasMax', 1, 8, true) ?? 3,
    sulcoInicialMm: numero(b.sulcoInicialMm, 'sulcoInicialMm', 1, 40),
    custo: numeroOpcional(b.custo, 'custo', 0, 100_000) ?? 0,
    dados: dicionario(b.dados, 'dados'),
  };
}

export function parseMovimento(body: unknown): MovimentoInput {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    tipo: opcao(b.tipo, 'tipo', TIPOS_MOVIMENTO),
    ts: b.ts === undefined ? new Date() : instante(b.ts, 'ts'),
    assetId: uuidOpcional(b.assetId, 'assetId'),
    posicao: textoOpcional(b.posicao, 'posicao', 20),
    kmVeiculo: numeroOpcional(b.kmVeiculo, 'kmVeiculo', 0, 10_000_000),
    sulcoMm: numeroOpcional(b.sulcoMm, 'sulcoMm', 0, 40),
    custo: numeroOpcional(b.custo, 'custo', 0, 100_000),
    obs: textoOpcional(b.obs, 'obs', 300),
  };
}

@Controller('pneus')
@UseGuards(PermissionsGuard)
export class PneusController {
  constructor(
    private readonly repo: PneusRepository,
    private readonly service: PneusService,
  ) {}

  @Get()
  listar(@ClientId() clientId: string, @Query('status') status?: string, @Query('assetId') assetId?: string) {
    return this.service.listarComNivel(clientId, status ? opcao(status, 'status', STATUS_PNEU) : null, uuidOpcional(assetId, 'assetId'));
  }

  @Get(':id/movimentos')
  async movimentos(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.buscar(clientId, id))) throw new NotFoundException('Pneu não encontrado');
    return this.repo.movimentos(clientId, id);
  }

  @Post()
  @RequirePermission('pneus.editar')
  async criar(@ClientId() clientId: string, @CurrentUserId() userId: string, @Body() body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    try {
      return await this.repo.criar(clientId, parsePneu(body), b.ts === undefined ? new Date() : instante(b.ts, 'ts'), userId);
    } catch (err) {
      if (violouUnique(err, UNIQUE.pneuNumeroFogo)) throw new ConflictException('Já existe um pneu com esse número de fogo');
      throw err;
    }
  }

  @Post(':id/movimentos')
  @RequirePermission('pneus.editar')
  movimentar(@ClientId() clientId: string, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.service.movimentar(clientId, id, parseMovimento(body), userId);
  }
}
