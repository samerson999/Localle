import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { booleano, erro, instante, numeroOpcional, opcao, periodo, SEM_LIMITE, texto, textoOpcional, uuid, uuidOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { type EventoInput, type MatrizInput, ORIGENS_EVENTO, RankingRepository } from './ranking.repository';
import { RankingService } from './ranking.service';

export function parseMatriz(codigo: string, body: unknown): MatrizInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!/^[a-z0-9_]{2,40}$/.test(codigo)) erro('"codigo" precisa ser snake_case de 2 a 40 caracteres');
  let faixas: { min: number; weight: number }[] | null = null;
  if (b.faixas !== undefined && b.faixas !== null) {
    if (!Array.isArray(b.faixas) || b.faixas.length > 10) erro('"faixas" precisa ser uma lista de até 10 faixas');
    faixas = b.faixas.map((f, i) => {
      const x = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>;
      return { min: numeroOpcional(x.min, `faixas[${i}].min`, 0, 1_000_000) ?? erro(`faixas[${i}].min obrigatório`), weight: numeroOpcional(x.weight, `faixas[${i}].weight`, 0, 1000) ?? erro(`faixas[${i}].weight obrigatório`) };
    });
  }
  return {
    codigo,
    label: textoOpcional(b.label, 'label', 80),
    categoria: textoOpcional(b.categoria, 'categoria', 40),
    peso: numeroOpcional(b.peso, 'peso', 0, 1000),
    faixas,
    ativo: booleano(b.ativo, 'ativo', true),
    custom: booleano(b.custom, 'custom'),
  };
}

export function parseEvento(body: unknown): EventoInput {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    motoristaId: uuid(b.motoristaId, 'motoristaId'),
    assetId: uuidOpcional(b.assetId, 'assetId'),
    ts: instante(b.ts, 'ts'),
    tipo: texto(b.tipo, 'tipo', 40),
    valor: numeroOpcional(b.valor, 'valor', -1_000_000, 1_000_000),
    origem: opcao(b.origem, 'origem', ORIGENS_EVENTO, 'manual'),
  };
}

@Controller('ranking')
@UseGuards(PermissionsGuard)
export class RankingController {
  constructor(
    private readonly repo: RankingRepository,
    private readonly service: RankingService,
  ) {}

  @Get()
  calcular(@ClientId() clientId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    const [inicio, fim] = periodo(de, ate, 30, SEM_LIMITE);
    return this.service.calcular(clientId, inicio, fim);
  }

  @Get('matriz')
  matriz(@ClientId() clientId: string) {
    return this.service.tipos(clientId);
  }

  @Put('matriz/:codigo')
  @RequirePermission('ranking.editar')
  salvarMatriz(@ClientId() clientId: string, @Param('codigo') codigo: string, @Body() body: unknown) {
    return this.repo.salvarMatriz(clientId, parseMatriz(codigo, body));
  }

  @Delete('matriz/:codigo')
  @RequirePermission('ranking.editar')
  @HttpCode(204)
  async restaurarMatriz(@ClientId() clientId: string, @Param('codigo') codigo: string) {
    if (!(await this.repo.removerMatriz(clientId, codigo))) throw new NotFoundException('Sem alteração para este código');
  }

  @Get('eventos')
  eventos(@ClientId() clientId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    const [inicio, fim] = periodo(de, ate, 30, SEM_LIMITE);
    return this.repo.eventos(clientId, inicio, fim);
  }

  @Post('eventos')
  @RequirePermission('ranking.editar')
  async criarEvento(@ClientId() clientId: string, @Body() body: unknown) {
    const e = await this.repo.criarEvento(clientId, parseEvento(body));
    if (!e) throw new NotFoundException('Motorista não encontrado');
    return e;
  }

  @Delete('eventos/:id')
  @RequirePermission('ranking.editar')
  @HttpCode(204)
  async removerEvento(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.removerEvento(clientId, id))) throw new NotFoundException('Evento não encontrado');
  }
}
