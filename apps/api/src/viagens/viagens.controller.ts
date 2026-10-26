import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ClientId } from '../clients/client-id.decorator';
import { booleano, erro, instante, opcao, texto, textoOpcional, uuid, uuidOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { type ErroVinculo, ETAPAS, type MatrizInput, type MatrizRow, type Parada, TIPOS_VIAGEM, type ViagemInput, type ViagemRow, ViagensRepository } from './viagens.repository';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseMatriz(body: unknown): MatrizInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.dias) || b.dias.length === 0 || b.dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) erro('"dias" precisa ser uma lista de dias da semana (0 a 6)');
  if (!Array.isArray(b.paradas) || b.paradas.length === 0 || b.paradas.length > 50) erro('"paradas" precisa ter de 1 a 50 itens');
  const paradas: Parada[] = b.paradas.map((p, i) => {
    const x = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
    if (typeof x.time !== 'string' || !HORA.test(x.time)) erro(`paradas[${i}].time precisa ser HH:MM`);
    return { fenceId: uuid(x.fenceId, `paradas[${i}].fenceId`), time: x.time };
  });
  const dorme: Record<string, string> = {};
  if (b.dorme !== undefined && b.dorme !== null) {
    if (typeof b.dorme !== 'object' || Array.isArray(b.dorme)) erro('"dorme" precisa ser um objeto dia → cerca');
    for (const [k, v] of Object.entries(b.dorme as Record<string, unknown>)) {
      if (!/^[0-6]$/.test(k)) erro('"dorme": chave precisa ser o dia da semana (0 a 6)');
      dorme[k] = uuid(v, `dorme.${k}`);
    }
  }
  return {
    nome: texto(b.nome, 'nome', 120),
    assetId: uuidOpcional(b.assetId, 'assetId'),
    motoristaId: uuidOpcional(b.motoristaId, 'motoristaId'),
    dias: [...new Set(b.dias as number[])].sort(),
    paradas,
    dorme,
    ativa: booleano(b.ativa, 'ativa', true),
  };
}

export function parseViagem(body: unknown): ViagemInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const tipo = opcao(b.tipo, 'tipo', TIPOS_VIAGEM);
  const v: ViagemInput = {
    tipo,
    nome: textoOpcional(b.nome, 'nome', 160),
    assetId: uuid(b.assetId, 'assetId'),
    motoristaId: uuidOpcional(b.motoristaId, 'motoristaId'),
    matrizId: uuidOpcional(b.matrizId, 'matrizId'),
    origemCercaId: uuidOpcional(b.origemCercaId, 'origemCercaId'),
    cargaCercaId: uuidOpcional(b.cargaCercaId, 'cargaCercaId'),
    descargaCercaId: uuidOpcional(b.descargaCercaId, 'descargaCercaId'),
    destinoCercaId: uuidOpcional(b.destinoCercaId, 'destinoCercaId'),
    carga: textoOpcional(b.carga, 'carga', 200),
  };
  if (tipo === 'externo' && (!v.origemCercaId || !v.destinoCercaId)) erro('Viagem externa exige "origemCercaId" e "destinoCercaId"');
  if ((v.cargaCercaId === null) !== (v.descargaCercaId === null)) erro('Carga e descarga andam juntas: informe as duas cercas ou nenhuma');
  return v;
}

function tratar<T extends MatrizRow | ViagemRow>(r: T | null | ErroVinculo, nome: string): T {
  if (r === 'ativo_invalido') throw new BadRequestException('Ativo não encontrado');
  if (r === 'motorista_invalido') throw new BadRequestException('Motorista não encontrado');
  if (r === 'cerca_invalida') throw new BadRequestException('Cerca não encontrada');
  if (r === 'matriz_invalida') throw new BadRequestException('Matriz não encontrada');
  if (!r) throw new NotFoundException(`${nome} não encontrada`);
  return r;
}

@Controller('viagens')
@UseGuards(PermissionsGuard)
export class ViagensController {
  constructor(private readonly repo: ViagensRepository) {}

  @Get('matrizes')
  listarMatrizes(@ClientId() clientId: string) {
    return this.repo.listarMatrizes(clientId);
  }

  @Post('matrizes')
  @RequirePermission('viagens.editar')
  async criarMatriz(@ClientId() clientId: string, @Body() body: unknown) {
    return tratar(await this.repo.salvarMatriz(clientId, parseMatriz(body), null), 'Matriz');
  }

  @Put('matrizes/:id')
  @RequirePermission('viagens.editar')
  async atualizarMatriz(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return tratar(await this.repo.salvarMatriz(clientId, parseMatriz(body), id), 'Matriz');
  }

  @Delete('matrizes/:id')
  @RequirePermission('viagens.editar')
  @HttpCode(204)
  async removerMatriz(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.removerMatriz(clientId, id))) throw new NotFoundException('Matriz não encontrada');
  }

  @Get()
  listar(@ClientId() clientId: string, @Query('assetId') assetId?: string, @Query('abertas') abertas?: string) {
    return this.repo.listarViagens(clientId, uuidOpcional(assetId, 'assetId'), abertas === 'true');
  }

  @Get(':id')
  async buscar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    return tratar(await this.repo.buscarViagem(clientId, id), 'Viagem');
  }

  @Post()
  @RequirePermission('viagens.editar')
  async criar(@ClientId() clientId: string, @Body() body: unknown) {
    return tratar(await this.repo.criarViagem(clientId, parseViagem(body)), 'Viagem');
  }

  /** Corpo `{ etapa, em?, origem? }` — `origem` = quem carimbou o início (rastreador, portaria, app, gestor). */
  @Post(':id/etapa')
  @RequirePermission('viagens.editar')
  async etapa(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) {
    const b = body ?? {};
    const r = await this.repo.avancarEtapa(clientId, id, opcao(b.etapa, 'etapa', ETAPAS), b.em === undefined ? new Date() : instante(b.em, 'em'), textoOpcional(b.origem, 'origem', 40));
    if (r === 'ordem') throw new ConflictException('Etapa fora de ordem para o estado atual da viagem');
    return tratar(r, 'Viagem');
  }

  @Post(':id/cancelar')
  @RequirePermission('viagens.editar')
  async cancelar(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    return tratar(await this.repo.cancelarViagem(clientId, id), 'Viagem');
  }
}
